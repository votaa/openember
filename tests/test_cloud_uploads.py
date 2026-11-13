import ast,copy,json,sys,unittest
from pathlib import Path
from unittest.mock import Mock
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from cloud_uploads import *
from copilot_prompt import build_copilot_system_prompt,build_knowledge_base_context
from report_window import report_window_message
from weather_context import summarize_weather
DOC=dict(name='synthetic-plan.txt',content=(ROOT/'tests/fixtures/uploads/synthetic-plan.txt').read_text())
# Compile the real context and provider functions without executing app/network setup.
app=ast.parse((ROOT/'streamlit/app.py').read_text())
functions=ast.Module(body=[n for n in app.body if isinstance(n,ast.FunctionDef) and n.name in ('build_context','stream_ollama')],type_ignores=[])
import types
scope=dict(globals(),CFG=types.SimpleNamespace(name='Long Island'),KNOWLEDGE_BASE={'floodZones':dict(label='Flood',source='Fixture',data='FULL_KB_SENTINEL')},OLLAMA_API_KEY='recording-only-key',OLLAMA_HOST='https://ollama.com',OLLAMA_MODEL='gpt-oss:120b-cloud',OLLAMA_HEADERS={})
import requests
scope['requests']=requests
exec(compile(functions,'streamlit/app.py','exec'),scope)

class UploadTests(unittest.TestCase):
    def test_real_context_and_provider_receive_complete_document_once(self):
        context=scope['build_context']([DOC],[],['floodZones'],[],[])
        for fact in ['CEDAR-731','47 amber cones','DELTA-19','no incident commander is specified','FULL_KB_SENTINEL']:
            self.assertIn(fact,context)
        self.assertIn(DOC['content'],context)
        from unittest.mock import patch
        with patch.object(requests,'post') as post:
            response=post.return_value.__enter__.return_value
            response.iter_lines.return_value=[json.dumps(dict(message=dict(content='recorded'),done=True)).encode()]
            self.assertEqual(''.join(scope['stream_ollama']([dict(role='user',content='Read the channel.')],context)),'recorded')
            self.assertEqual(post.call_count,1)
            body=post.call_args.kwargs['json']
            self.assertIn(DOC['content'],body['messages'][0]['content'])
            self.assertEqual(body['options']['num_predict'],8192)
    def test_overflow_prevents_provider_call_and_preserves_input(self):
        from unittest.mock import patch
        with patch.object(requests,'post') as post:
            context='x'*98305;messages=[dict(role='user',content='question')];before=copy.deepcopy(messages)
            answer=''.join(scope['stream_ollama'](messages,context))
            self.assertIn('Nothing was sent to the model',answer)
            self.assertEqual(messages,before);post.assert_not_called()
    def test_utf8_boundaries_and_bad_uploads(self):
        file=dict(name='unicode.txt',content='🙂'*16384)
        self.assertEqual(validate_uploads([file]),65536)
        with self.assertRaises(UploadError):validate_uploads([{**file,'content':file['content']+'a'}])
        self.assertEqual(validate_uploads([file,{**file,'name':'second.md'}]),131072)
        for files in [[file,{**file,'name':'second.md'},dict(name='extra.txt',content='x')],[DOC,DOC],[dict(name='bad.pdf',content='abc')]]:
            with self.assertRaises(UploadError):validate_uploads(files)
        with self.assertRaises(UploadError):decode_upload('bad.txt',b'\xff')
        self.assertEqual(decode_upload('bom.TXT',b'\xef\xbb\xbfA'),dict(name='bom.TXT',content='A'))
    def test_prompt_boundaries_include_all_sources(self):
        self.assertEqual(validate_cloud_messages([dict(role='system',content='x'*98304)]),98304)
        with self.assertRaises(UploadError):validate_cloud_messages([dict(role='system',content='x'*98304),dict(role='user',content='x')])

if __name__=='__main__':
    if '--projections' in sys.argv:
        def project(files):
            try:return dict(bytes=validate_uploads(files),context=uploaded_document_context(files))
            except UploadError as exc:return dict(error=str(exc),code=exc.code,status=exc.status)
        print(json.dumps(dict(limits=UPLOAD_LIMITS,guidance=UPLOAD_GUIDANCE,cases=[project(files) for files in json.load(sys.stdin)]),ensure_ascii=False))
    else:unittest.main()
