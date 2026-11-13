import sys,json,unittest,copy
from pathlib import Path
from unittest.mock import Mock
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'streamlit'))
from copilot_service import application_stream
from copilot_contract import validate_contract
from ollama_provider import configuration,stream_chat
from chat_job import ChatJob,sync_chat_job,response_label,timing_label
from tests.test_ollama_provider import Response
FIXTURE=json.loads((ROOT/'shared/copilot/fixtures/phase4-fallback.json').read_text())


def run(case):
    request=copy.deepcopy(FIXTURE['requests'][case['request']])
    env=dict(OLLAMA_MODE=case['mode'],OLLAMA_API_KEY='fixture-key' if case['key'] else '',OLLAMA_LOCAL_NUM_CTX='32768')
    cfg=configuration(lambda key,default='':env.get(key,default))
    http=Mock();http.get.return_value=Response(models=[dict(name='qwen3:8b')])
    kind=case['upstream']
    frames=['not json'] if kind=='malformed' else [dict(message=dict(thinking='private reasoning' if kind=='thinking_error' else '',content='Partial answer' if kind=='partial_error' else '')),dict(error='upstream failure')]
    http.post.side_effect=lambda *a,**k:Response(frames,status=503 if kind=='http_error' else 200)
    def provider(messages,config,**kwargs):return stream_chat(messages,config,http,**kwargs)
    frames=list(application_stream(request,cfg,provider))
    response=next(f['response'] for f in reversed(frames) if 'response' in f)
    validate_contract('result',response)
    normalized={k:v for k,v in response.items() if k!='generated_at'}
    return dict(response=normalized,content=''.join(f.get('message',{}).get('content','') for f in frames),posts=http.post.call_count,done=sum(bool(f.get('done')) for f in frames),providers=sum('provider' in f for f in frames),errors=sum('error' in f for f in frames),label=response_label(response)),frames


class FallbackTests(unittest.TestCase):
    def test_shared_failure_matrix_and_worker_delivery(self):
        for case in FIXTURE['scenarios']:
            with self.subTest(case=case['id']):
                result,frames=run(case)
                self.assertEqual(result['response']['execution_mode'],case['expected_mode'])
                self.assertEqual(result['response']['answer_status'],case['expected_status'])
                self.assertEqual(result['posts'],case['posts']);self.assertEqual(result['done'],1)
                request=copy.deepcopy(FIXTURE['requests'][case['request']])
                state=dict(messages=[dict(role='assistant',content='')],chat_response_pending=True)
                job=ChatJob(request,{},0,lambda *_:iter(frames));state['chat_job']=job
                job.start();job.start();job.wait(2);self.assertTrue(sync_chat_job(state))
                self.assertFalse(state['chat_response_pending']);self.assertNotIn('chat_job',state)
                self.assertNotIn('private reasoning',state['messages'][0]['content'])
                self.assertEqual(state['messages'][0]['response']['answer_status'],case['expected_status'])
                if case['expected_mode']=='rule_based_fallback':
                    self.assertEqual(result['providers'],0);self.assertEqual(result['errors'],0)
                    self.assertNotIn('ollama_provider',state);self.assertNotIn('thinking',timing_label(state['messages'][0]['timing']).lower())
    def test_generator_close_is_cancellation_not_fallback(self):
        closed=[]
        def provider(*_,**kwargs):
            try:
                yield dict(provider=dict(provider='local',model='fixture',attempts=[]))
                yield dict(message=dict(thinking='pending'))
                raise AssertionError('Cancelled generation must not resume')
            finally:closed.append(True)
        stream=application_stream(FIXTURE['requests']['unknown'],dict(mode='local-only',local_num_ctx=32768),provider)
        self.assertIn('response',next(stream));stream.close();self.assertEqual(closed,[True])

if __name__=='__main__':
    if '--projections' in sys.argv:print(json.dumps([run(case)[0] for case in FIXTURE['scenarios']],ensure_ascii=False))
    else:unittest.main()
