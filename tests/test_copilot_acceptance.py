"""Production Streamlit builders + real provider router with a recording HTTP client."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'streamlit'),str(ROOT/'tests/helpers')]
from copilot_legacy import legacy_streamlit
from copilot_service import application_stream
from copilot_snapshot import make_request,with_legacy_context
from ollama_provider import configuration,stream_chat
from tests.test_ollama_provider import Response

class AcceptanceTests(unittest.TestCase):
    def test_configured_311_snapshot_preserves_endpoint_filter_window_and_zero(self):
        data=json.loads((ROOT/'shared/copilot/fixtures/legacy-input.json').read_text())
        config=json.loads((ROOT/'config/jurisdiction.generated.json').read_text())
        source=next(s for s in config['source_registry'] if s['id']=='nyc_311_electric_hazards_rockaway')
        reports=data['phase4_results'][source['id']]
        request=make_request('Break down the available 311 electrical-hazard reports.',[],data['jurisdiction'],[],reports=reports,report_source=source,now=reports['fetched_at'])
        def forbidden(*a,**kw):raise AssertionError('Provider forbidden')
        frames=list(application_stream(request,{},forbidden));answer=frames[-1]['message']['content']
        self.assertEqual(frames[0]['response']['answer_status'],'answered')
        for text in [source['endpoint'],source['required_filter'],reports['fetched_at'],*reports['report_window'].values(),*[f"{r['label']}: {r['total']}" for r in reports['aggregate_counts']],'not utility-confirmed outages']:
            self.assertIn(text,answer)

    def test_full_cloud_capability_matrix_and_pre_stream_fallback(self):
        data=json.loads((ROOT/'shared/copilot/fixtures/legacy-input.json').read_text())
        base=json.loads((ROOT/'shared/copilot/fixtures/phase3-context.json').read_text())['cases'][0]['request']
        for scenario in data['scenarios']:
            for mode in ('cloud-only','local-first'):
                with self.subTest(scenario=scenario['id'],mode=mode):
                    request=copy.deepcopy(base);request['question']=scenario['question'];request['answer_method']='model';request['jurisdiction']['enabled_kb_modules']=scenario['enabled_modules']
                    for block in request['evidence']:
                        if block['kind']=='kb':
                            enabled=block['values']['module_id'] in scenario['enabled_modules']
                            block['state'].update(availability='available' if enabled else 'omitted',omission_reason=None if enabled else 'selection')
                    golden=legacy_streamlit(data,scenario)
                    legacy_body=golden[0]['content'].split('\n\nKNOWLEDGE BASE:\n',1)[1].rsplit('\n\nRULES: ',1)[0]
                    full=with_legacy_context(request,legacy_body)
                    cfg=configuration(lambda k,d='':dict(OLLAMA_MODE=mode,OLLAMA_LOCAL_NUM_CTX='65536',OLLAMA_API_KEY='recording-only-key').get(k,d))
                    http=Mock();http.get.return_value=Response(models=[dict(name='qwen3:8b')])
                    http.post.side_effect=([Response(status=503)] if mode=='local-first' else [])+[Response([dict(message=dict(content='Recorded acceptance response'),done=True)])]
                    acquisitions=[]
                    def cloud_factory():acquisitions.append(1);return full
                    frames=list(application_stream(request,cfg,lambda messages,config,**kw:stream_chat(messages,config,http,**kw),cloud_factory))
                    self.assertEqual(len(acquisitions),1)
                    self.assertEqual(http.get.call_count,1 if mode=='local-first' else 0)
                    self.assertEqual(http.post.call_count,2 if mode=='local-first' else 1)
                    cloud=http.post.call_args.kwargs['json']['messages']
                    self.assertTrue(cloud[0]['content'].startswith(golden[0]['content']))
                    self.assertEqual(cloud[-1]['content'],scenario['question'])
                    for id,module in data['kb'].items():
                        if id in scenario['enabled_modules']:self.assertIn(module['data'],cloud[0]['content'])
                        else:self.assertNotIn(module['data'],cloud[0]['content'])
                    self.assertEqual(''.join(f.get('message',{}).get('content','') for f in frames),'Recorded acceptance response')
                    self.assertEqual(next(f['response']['context']['policy'] for f in frames if 'response' in f),'cloud_full')

if __name__=='__main__':unittest.main()
