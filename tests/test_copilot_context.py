import sys,json,unittest,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from copilot_context import build_local_context
from copilot_intent import plan_request
from copilot_service import exact_results,application_stream,cloud_context
from copilot_snapshot import with_legacy_context
from copilot_contract import validate_contract
from ollama_provider import stream_chat,configuration
FIXTURE=json.loads((ROOT/'shared/copilot/fixtures/phase3-context.json').read_text())

def projections():
    return [build_local_context(c['request'],c['allocated_context'],plan_request(c['request']),exact_results(c['request'],plan_request(c['request']))) for c in FIXTURE['cases']]

class ContextTests(unittest.TestCase):
    def test_full_enabled_kb_and_late_document_passages(self):
        outputs=projections()
        for case,out in zip(FIXTURE['cases'],outputs):
            with self.subTest(case=case['id']):
                validate_contract('request',case['request'])
                for block in case['request']['evidence']:
                    if block['kind']=='kb' and block['values']['module_id'] in case['request']['jurisdiction']['enabled_kb_modules']:
                        self.assertEqual(next(b for b in out['selected'] if b['id']==block['id'])['values']['content'],block['values']['content'])
                if not out['context']['processing_limit']:self.assertTrue(out['context']['accounting']['fits_estimate'])
        late=outputs[1]
        self.assertIn('DELTA-19',late['messages'][0]['content'])
        self.assertNotIn('UNRELATED_LIVE_MARKER',late['messages'][0]['content'])
        self.assertNotIn('OLD_DISABLED_KB_FACT',outputs[-2]['messages'][0]['content']+' '.join(m['content'] for m in outputs[-2]['messages'][1:]))
        self.assertNotIn('OLD_HIDDEN_LAYER_COUNT',' '.join(m['content'] for m in outputs[-1]['messages']))
    def test_projection_is_immutable_and_grid_coverage_is_explicit(self):
        request=copy.deepcopy(next(c['request'] for c in FIXTURE['cases'] if c['id']=='gust-grid'))
        before=copy.deepcopy(request)
        result=build_local_context(request,32768,plan_request(request))
        self.assertEqual(request,before)
        self.assertTrue(any('coverage is unverified' in ' '.join(b['limitations']) for b in result['selected']))

    def test_grounding_regressions_retain_facts_and_unknowns(self):
        from copilot_contract import POLICY
        regressions=json.loads((ROOT/'shared/copilot/fixtures/grounding-regressions.json').read_text())
        for case in regressions['cases']:
            with self.subTest(case=case['id']):
                request=copy.deepcopy(FIXTURE['cases'][0]['request']);request['question']=case['question']
                before=copy.deepcopy(request);plan=plan_request(request)
                self.assertEqual(plan['outcome'],'synthesis')
                out=build_local_context(request,32768,plan,exact_results(request,plan))
                self.assertEqual(request,before)
                self.assertIsNone(out['context']['processing_limit'])
                self.assertEqual(out['context']['prompt_version'],'grounded-local-v2')
                system=out['messages'][0]['content']
                self.assertTrue(system.endswith(POLICY['context']['response_rules']))
                forecast=next(b for b in out['selected'] if b['kind']=='forecast')
                self.assertEqual(forecast['values']['periods'][0]['probabilityOfPrecipitation']['value'],20)
                for block in request['evidence']:
                    if block['kind']=='selected_feature' or block['kind']=='kb' and block['values']['module_id'] in request['jurisdiction']['enabled_kb_modules']:
                        self.assertEqual(next(b for b in out['selected'] if b['id']==block['id'])['values'],block['values'])
                if case['id']!='weather':
                    passages='\n'.join(p['text'] for b in out['selected'] if b['kind']=='document' for p in b['values']['passages'])
                    for fact in ['CEDAR-731','47 amber cones','DELTA-19','no incident commander is specified']:
                        self.assertIn(fact,passages)

    def test_budget_limit_never_calls_provider_or_cloud(self):
        request=next(c['request'] for c in FIXTURE['cases'] if c['id']=='mandatory-overflow')
        def forbidden(*args,**kwargs):raise AssertionError('No inference or automatic cloud for a processing limit')
        frames=list(application_stream(request,dict(mode='local-first',local_num_ctx=4096),forbidden,forbidden))
        self.assertEqual(frames[0]['response']['execution_mode'],'rule_based_fallback')
        self.assertIn('processing limit',frames[-1]['message']['content'])
    def test_provider_callback_rebuilds_cloud_context_with_one_attempt_per_provider(self):
        from unittest.mock import Mock
        from tests.test_ollama_provider import Response
        request=copy.deepcopy(FIXTURE['cases'][1]['request']);calls=[]
        full=with_legacy_context(request,'FULL_CLOUD_LATE_FACT '+('cloud only '*10000))
        http=Mock();http.get.return_value=Response(models=[dict(name='qwen3:8b')])
        http.post.side_effect=[Response(status=503),Response([dict(message=dict(content='Grounded'),done=True)])]
        config=configuration(lambda key,default='':dict(OLLAMA_MODE='local-first',OLLAMA_LOCAL_NUM_CTX='32768',OLLAMA_API_KEY='fixture-key').get(key,default))
        def cloud_factory():calls.append(1);return full
        def provider(messages,cfg,**kwargs):return stream_chat(messages,cfg,http,**kwargs)
        frames=list(application_stream(request,config,provider,cloud_factory))
        self.assertEqual(len(calls),1);self.assertEqual(http.post.call_count,2)
        self.assertNotIn('FULL_CLOUD_LATE_FACT',http.post.call_args_list[0].kwargs['json']['messages'][0]['content'])
        self.assertIn('FULL_CLOUD_LATE_FACT',http.post.call_args_list[1].kwargs['json']['messages'][0]['content'])
        self.assertEqual(frames[0]['response']['provider'],'cloud')

if __name__=='__main__':
    if '--projections' in sys.argv:print(json.dumps(projections(),ensure_ascii=False))
    else:unittest.main()
