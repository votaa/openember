import sys,json,unittest,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from copilot_intent import plan_request
from copilot_local_queries import local_answer
from copilot_service import application_stream,synthesis_messages
from copilot_snapshot import make_request,with_legacy_context
from chat_job import ChatJob,sync_chat_job
from chat_state import begin_chat_response
CORPUS=json.loads((ROOT/'shared/copilot/fixtures/conformance.json').read_text())

def requests():
    evidence={f['id']:f['expected'] for f in CORPUS['adapters']}
    return [dict(copy.deepcopy(CORPUS['base_request']),**copy.deepcopy(c['request']),evidence=[copy.deepcopy(evidence[id]) for id in c['evidence_ids']]) for c in CORPUS['planning_cases'] if c['expected']['outcome']!='synthesis']

class CopilotLocalTests(unittest.TestCase):
    def test_every_local_case_bypasses_provider_and_completes_once(self):
        def forbidden(*args): raise AssertionError('provider must not run')
        for request in requests():
            with self.subTest(question=request['question']):
                frames=list(application_stream(request,{},forbidden))
                self.assertEqual(len([f for f in frames if f.get('done')]),1)
                self.assertEqual(frames[0]['response']['execution_mode'],'local_query')
                self.assertIsNone(frames[0]['response']['provider'])
                self.assertEqual(frames[-1]['message']['content'],local_answer(request,plan_request(request))['answer'])
    def test_worker_retains_metadata_across_reruns_and_does_not_update_provider(self):
        request=requests()[0];messages=[];index=begin_chat_response(messages,request['question'])
        state=dict(messages=messages,chat_response_pending=True,ollama_provider={'provider':None})
        job=ChatJob(request,{},index,application_stream);state['chat_job']=job
        sync_chat_job(state);job.wait(2);sync_chat_job(state)
        self.assertEqual(messages[index]['response']['execution_mode'],'local_query')
        self.assertEqual(state['ollama_provider'],{'provider':None})
        self.assertFalse(state['chat_response_pending'])
        self.assertFalse(sync_chat_job(state))
    def test_synthesis_preserves_full_context_and_question(self):
        request=with_legacy_context(dict(CORPUS['base_request'],question='Compare the plan and weather.'),'Full KB '+('retained '*8000)+'LATE-KB-FACT')
        calls=[]
        def provider(messages,config):
            calls.append(messages)
            yield {'provider':{'provider':'local','model':'fixture'}}
            yield {'message':{'content':'Grounded'},'done':True}
        frames=list(application_stream(request,{},provider))
        self.assertEqual(calls,[synthesis_messages(request)])
        self.assertIn('LATE-KB-FACT',calls[0][0]['content'])
        self.assertEqual(frames[0]['response']['execution_mode'],'llm_grounded')

    def test_production_preparation_and_renderer_bypass_unrelated_evidence_and_survive_rerun(self):
        import ast
        from streamlit.testing.v1 import AppTest
        tree=ast.parse((ROOT/'streamlit/app.py').read_text())
        prepare=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='prepare_chat_job')
        render=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='render_chat_messages')
        raw=copy.deepcopy(next(f['raw'] for f in CORPUS['adapters'] if f['id']=='forecast'))
        script=f'''import sys,time,datetime
from types import SimpleNamespace
sys.path.insert(0,{str(ROOT/'streamlit')!r})
import streamlit as st
from copy import deepcopy
from chat_job import ChatJob,sync_chat_job,timing_label,response_label
from chat_state import begin_chat_response
from copilot_snapshot import make_request,with_legacy_context,with_synthesis_snapshot
from copilot_intent import plan_request
from copilot_service import application_stream as real_stream
from ollama_provider import provider_label
_time=SimpleNamespace(monotonic=time.monotonic)
COPILOT_MODE='hybrid'
OLLAMA_CONFIG={{}}
CFG=SimpleNamespace(name='Long Island',timezone='America/New_York',source=lambda id:None)
active_kb=[]
KNOWLEDGE_BASE={{}}
def forbidden(*args,**kwargs): raise AssertionError('Unrelated source or model work')
build_context=auto_fetch_noaa_endpoints=refresh_stale_endpoints=fetch_noaa_ep=cached_map_evidence=forbidden
if 'messages' not in st.session_state:
 st.session_state.messages=[]
 st.session_state.calls=[]
 st.session_state.chat_response_pending=True
 st.session_state.map_layers=[]
 st.session_state.mb_layers=[]
 st.session_state.phase4_results={{}}
 st.session_state.files=[]
 st.session_state.api_results=[]
 st.session_state.esri_items=[]
 st.session_state.gauge_data={{}}
 raw={raw!r}
 raw['fetched_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 st.session_state.noaa_results={{'nws_forecast_li':raw}}
 st.session_state.pending_query="What is first period's low and wind?"
 st.session_state.poll_reruns=0
calls=st.session_state.calls
def application_stream(request,config):
 calls.append(1)
 for frame in real_stream(request,config,forbidden):
  yield frame
  if frame.get('response'): time.sleep(.25)
{ast.unparse(prepare)}
if st.session_state.get('pending_query') and not st.session_state.get('chat_job'):
 prepare_chat_job(st.session_state.pending_query)
def poll_sleep(seconds):
 time.sleep(seconds)
 job=st.session_state.get('chat_job')
 if not st.session_state.poll_reruns and job and job.snapshot().get('response'):
  st.session_state.poll_reruns=1
  st.rerun()
_time.sleep=poll_sleep
{ast.unparse(render)}
render_chat_messages()
st.button('Send',disabled=st.session_state.chat_response_pending)
'''
        app=AppTest.from_string(script).run(timeout=15)
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state.calls,[1])
        self.assertEqual(app.session_state.poll_reruns,1)
        self.assertIn('Low: 44°F; Wind: 7 to 10 mph W',app.session_state.messages[1]['content'])
        self.assertEqual(app.session_state.messages[1]['response']['execution_mode'],'local_query')
        self.assertFalse(app.button[0].disabled)
        self.assertNotIn('thinking_ms',app.session_state.messages[1]['timing'])

if __name__=='__main__':
    if '--results' in sys.argv: print(json.dumps([local_answer(r,plan_request(r)) for r in json.load(sys.stdin)],ensure_ascii=False))
    elif '--temporal' in sys.argv:
        cases=json.loads((ROOT/'shared/copilot/fixtures/phase2-local.json').read_text())
        print(json.dumps([dict(plan=plan_request(c['request']),answer=local_answer(c['request'],plan_request(c['request']))['answer']) for c in cases],ensure_ascii=False))
    else: unittest.main()
