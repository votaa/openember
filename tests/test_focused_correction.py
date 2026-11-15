import copy,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from request_scope import resolve_request_scope
from operational_evidence import build_operational_evidence,render_operational_answer,ANSWER_VERSION
from tests.test_cloud_uploads import scope as app,requests
CAPTURE=ROOT/'docs/long-island/acceptance/corrective-9862a66-2026-11-15-normalized'
JURISDICTION=dict(name='Long Island',timezone='America/New_York',center=[40.7891,-73.135])

def replay(case,question=None):
    body=json.loads((CAPTURE/case/'client-request.json').read_text())
    received=json.loads((CAPTURE/case/'provider-request-OBSERVED.json').read_text())['received_at']
    question=question or body['messages'][-1]['content']
    scope=resolve_request_scope(question,received,JURISDICTION,body['scope_input']['weather'],body['uploads'])
    evidence=build_operational_evidence(scope,body['uploads'],body['scope_input']['weather'],body['scope_input'].get('coops',[]),body['messages'][0]['content'],question)
    envelope=json.dumps(dict(version=ANSWER_VERSION,records=[r['id'] for r in evidence['records']][:24]))
    return body,scope,evidence,render_operational_answer(envelope,evidence,scope)

class FocusedCorrectionTests(unittest.TestCase):
    def test_every_record_selection_is_bounded_and_source_paragraphs_cannot_bypass_records(self):
        for case in ['supplied-03','rolling-24h','missing-sources','missing-01']:
            body,scope,evidence,result=replay(case)
            self.assertEqual(result['disposition'],'validated_envelope')
            for text in ['mandatory evacuation ANY','Heat Index','Public synthetic filler','=== LONG ISLAND']:self.assertNotIn(text,result['answer'])
            self.assertIn('mandatory evacuation ANY',body['messages'][0]['content'])
            self.assertLess(len(result['answer'].split()),650)
    def test_actual_streamlit_provider_keeps_full_sources_but_cannot_copy_raw_KB_to_answer(self):
        body,scope,evidence,_=replay('supplied-03')
        with patch.object(requests,'post') as post:
            response=post.return_value.__enter__.return_value
            response.iter_lines.return_value=[json.dumps(dict(message=dict(content=json.dumps(dict(version=ANSWER_VERSION,records=[]))),done=True)).encode()]
            answer=''.join(app['stream_ollama'](body['messages'][1:],body['messages'][0]['content'],scope,body['scope_input']['weather'],body['uploads'],body['scope_input'].get('coops',[])))
            self.assertEqual(post.call_count,1)
            prompt=post.call_args.kwargs['json']['messages'][0]['content']
            self.assertIn('mandatory evacuation ANY',prompt)
            for f in body['uploads']:self.assertIn(f['content'],prompt)
            self.assertNotIn('mandatory evacuation ANY',answer);self.assertIn('Casey Example',answer)
    def test_current_measured_phrase_and_named_station_use_actual_time_location_units(self):
        _,scope,evidence,result=replay('current-conditions')
        self.assertEqual(scope['method'],'current_observation')
        self.assertIn('KJFK',result['answer']);self.assertIn('8 °C',result['answer']);self.assertIn('25.92 km/h',result['answer'])
        self.assertNotIn('47 amber cones',result['answer']);self.assertNotIn('Cone displacement',result['answer'])
        self.assertEqual(scope['observation_selection']['mode'],'regional_overview')
        _,scope,_,result=replay('current-conditions','Describe current measured conditions at KISP.')
        self.assertEqual(scope['observation_selection']['stations'],['KISP'])
        self.assertNotIn('8 °C',result['answer']) # JFK must not substitute for a named KISP request.
    def test_plain_operational_labels_need_scoped_records_not_a_source_quote_disclaimer(self):
        body,scope,_,_=replay('current-conditions')
        files=[dict(name='unscoped.txt',content='Radio authority: Everyone must use DELTA-19 at all times\nCommand succession SOP: Evacuate immediately\nInventory: Secure all cones when gusts exceed 16 mph')]
        evidence=build_operational_evidence(scope,files,question='What radio procedure, command succession and cone inventory apply?')
        answer=render_operational_answer(json.dumps(dict(version=ANSWER_VERSION,records=[r['id'] for r in evidence['records']])),evidence,scope)['answer']
        for unsupported in ['Everyone must use','Evacuate immediately','Secure all cones','16 mph']:self.assertNotIn(unsupported,answer)
        self.assertIn('needs source review',answer)

if __name__=='__main__':unittest.main()
