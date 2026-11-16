import ast,copy,json,sys,types,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'streamlit'))
from request_scope import resolve_request_scope,render_request_scope
from live_answer import build_live_answer,live_answer_instruction,render_live_answer,record_answer_result
from location_synthesis import SYNTHESIS_VERSION
from copilot_prompt import build_copilot_system_prompt
from evidence_summary import strip_weather_context,evidence_summary
from cloud_uploads import validate_cloud_messages,UploadError,UPLOAD_LIMITS,uploaded_document_context
from chat_state import begin_chat_response,finish_chat_response
import requests
CASES=json.loads((ROOT/'tests/fixtures/locations/source-adapters.json').read_text())

def project(x):
    scope=resolve_request_scope(x['question'],x['requestedAt'],x['jurisdiction'],x['weather'],files=x.get('files'),selected_location=x.get('selectedLocation'),local_jurisdiction=x.get('localJurisdiction'))
    evidence=build_live_answer(scope,x.get('files'),x['weather'],context=x['context'],question=x['question'])
    proposal=dict(version=evidence['version'],statements=[c['proposal'] for c in evidence['synthesis']['candidates'] if c['proposal']['category']=='conditional_consideration'][:32])
    result=render_live_answer(json.dumps(proposal),evidence,scope)
    record_answer_result(scope,result,completion_reason='stop',provider_called=True)
    return dict(scope=scope,instruction=live_answer_instruction(evidence),result=result,prompt_scope=dict(scope=json.loads(render_request_scope(scope,x['weather']).split('\n')[1]),weather=json.loads(render_request_scope(scope,x['weather']).split('\n')[3])))

app_ast=ast.parse((ROOT/'streamlit/app.py').read_text())
node=next(n for n in app_ast.body if isinstance(n,ast.FunctionDef) and n.name=='stream_ollama')
namespace=dict(json=json,requests=requests,CFG=types.SimpleNamespace(name='Long Island'),OLLAMA_API_KEY='recording-only',OLLAMA_HOST='https://example.invalid',OLLAMA_MODEL='recording-model',OLLAMA_HEADERS={},strip_weather_context=strip_weather_context,resolve_request_scope=resolve_request_scope,render_request_scope=render_request_scope,evidence_summary=evidence_summary,build_copilot_system_prompt=build_copilot_system_prompt,validate_cloud_messages=validate_cloud_messages,UploadError=UploadError,UPLOAD_LIMITS=UPLOAD_LIMITS)
exec(compile(ast.Module(body=[node],type_ignores=[]),'streamlit/app.py','exec'),namespace)

def scope_for(x):return resolve_request_scope(x['question'],x['requestedAt'],x['jurisdiction'],x['weather'],selected_location=x.get('selectedLocation'),local_jurisdiction=x.get('localJurisdiction'))
class LiveAnswerTests(unittest.TestCase):
    def test_actual_streamlit_provider_retains_source_validation_and_history(self):
        for case in ['kfrg-real-kb','hospital-real-kb','retained-upload-inventory']:
            x=next(x for x in CASES if x['name']==case);context=x['context']+uploaded_document_context(x['files']);scope=scope_for(x);history=[];index=begin_chat_response(history,x['question']);history[index]['scope']=scope;history[index]['sourceMaterial']=context
            def respond(*args,**kwargs):
                system=kwargs['json']['messages'][0]['content']
                registry=json.loads(system.rsplit('Registry: ',1)[1].split(' All supported facts and material gaps render independently.')[0])
                output=json.dumps(dict(version=SYNTHESIS_VERSION,statements=registry))
                response=types.SimpleNamespace(raise_for_status=lambda:None,iter_lines=lambda:[json.dumps(dict(message=dict(content=output[:20]))).encode(),json.dumps(dict(message=dict(content=output[20:]),done=True,done_reason='stop')).encode()])
                manager=unittest.mock.MagicMock();manager.__enter__.return_value=response;return manager
            with patch.object(requests,'post',side_effect=respond) as post:
                answer=''.join(namespace['stream_ollama']([dict(role='user',content=x['question'])],context,scope,x['weather'],x['files']))
                self.assertEqual(post.call_count,1);prompt=post.call_args.kwargs['json']['messages'][0]['content']
                self.assertIn(x['context'],prompt)
                for f in x['files']:self.assertIn(f['content'],prompt)
                self.assertLessEqual(len(prompt.encode())+len(x['question'].encode()),98304)
            finish_chat_response(history,index,answer);stored=json.loads(json.dumps(history))
            self.assertEqual(stored[index]['scope']['enforcement']['route'],'location_synthesis')
            self.assertEqual(stored[index]['scope']['synthesis']['validation']['operational_verification'],'not_established')
            self.assertEqual(stored[index]['scope']['synthesis']['validation']['format'],'valid')
            self.assertIn('Conditional considerations',stored[index]['content'])
            self.assertEqual(stored[index]['sourceMaterial'],context)
    def test_streamlit_interruption_length_missing_terminal_and_malformed_stream_keep_supported_fallback(self):
        x=CASES[0]
        frames=[['not-json'],[json.dumps(dict(message=dict(content='unsupported prose'),done=True,done_reason='length'))],[json.dumps(dict(message=dict(content='unsupported prose')))]]
        for lines in frames:
            scope=scope_for(x)
            with patch.object(requests,'post') as post:
                response=post.return_value.__enter__.return_value;response.iter_lines.return_value=[line.encode() for line in lines]
                answer=''.join(namespace['stream_ollama']([dict(role='user',content=x['question'])],x['context'],scope,x['weather'],x['files']))
            self.assertNotIn('unsupported prose',answer);self.assertIn('4030 seconds old',answer)
            self.assertEqual(scope['synthesis']['validation']['response_completeness'],'supported_fallback')
            self.assertEqual(scope['enforcement']['provider_called'],True)
    def test_map_callback_retains_clicked_snapshot_before_component_remount(self):
        from map_interaction import map_feature_popup_html,map_feature_from_map_data,map_component_key
        callback=next(n for n in app_ast.body if isinstance(n,ast.FunctionDef) and n.name=='operational_map_event')
        class State(dict):
            __getattr__=dict.__getitem__
            __setattr__=dict.__setitem__
        state=State(map_interaction_revision=0,chat_response_pending=False)
        key=map_component_key(0)
        state[key]=dict(last_object_clicked_popup=map_feature_popup_html('Hospital','North Shore University Hospital','Trauma Centers','Point',location_feature=dict(lat=40.7765,lng=-73.6993)))
        ns=dict(st=types.SimpleNamespace(session_state=state),map_component_key=map_component_key,map_feature_from_map_data=map_feature_from_map_data)
        exec(compile(ast.Module(body=[callback],type_ignores=[]),'streamlit/app.py','exec'),ns)
        ns['operational_map_event']()
        self.assertEqual(state.selected_map_feature['title'],'North Shore University Hospital')
        state[key]={} # Source refresh remounted the component after its callback.
        self.assertEqual(state.selected_map_feature['selected_location']['geometry']['type'],'Point')
        state.selected_map_feature=None;state.chat_response_pending=True
        state[key]=dict(last_object_clicked_popup=map_feature_popup_html('Other','Other','Map','Point'))
        ns['operational_map_event']();self.assertIsNone(state.selected_map_feature)

    def test_prompt_overflow_calls_no_provider_and_records_incomplete_validation(self):
        x=CASES[0];scope=scope_for(x)
        with patch.object(requests,'post') as post:
            text=''.join(namespace['stream_ollama']([dict(role='user',content=x['question'])],'x'*98305,scope,x['weather'],[]))
        post.assert_not_called();self.assertIn('Nothing was sent',text)

if __name__=='__main__':
    if '--project' in sys.argv:print(json.dumps([project(x) for x in json.load(sys.stdin)]))
    else:unittest.main()
