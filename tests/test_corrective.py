import json,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from operational_evidence import build_operational_evidence,render_operational_answer
from tidal_gauges import get_flood_status
from tests.test_cloud_uploads import scope as app,requests
FIXTURE=json.loads((ROOT/'tests/fixtures/corrective/regressions.json').read_text())
SCOPE=dict(status='resolved',method='source_period',timezone='America/New_York',jurisdiction='Long Island',request_utc=FIXTURE['request_utc'],interval=FIXTURE['interval'])
POSITIVE=dict(name='positive-plan.md',content=(ROOT/'tests/fixtures/corrective/positive-plan.md').read_text())

class CorrectiveTests(unittest.TestCase):
    def test_real_streamlit_provider_and_rendering_preserve_positive_evidence_and_contain_prose(self):
        for content,expected in [(json.dumps(dict(version='operational-answer-v2',records=[])),'validated_envelope'),('Alert if water rises > 1 ft above the low-tide mark.','incomplete')]:
            with self.subTest(expected=expected),patch.object(requests,'post') as post:
                response=post.return_value.__enter__.return_value
                response.iter_lines.return_value=[json.dumps(dict(message=dict(content=content),done=True)).encode()]
                scope=json.loads(json.dumps(SCOPE))
                text=''.join(app['stream_ollama']([dict(role='user',content='Assess CEDAR-731 cones, commander, deployment, threshold and authorized radio procedure tonight')],POSITIVE['content'],scope,[],[POSITIVE],[]))
                self.assertEqual(post.call_count,1)
                payload=post.call_args.kwargs['json']
                self.assertIn(POSITIVE['content'],payload['messages'][0]['content'])
                self.assertNotIn('format',payload);self.assertIn('CONTROLLED OUTPUT CONTRACT:',payload['messages'][0]['content'])
                self.assertEqual(scope['enforcement']['status'],expected)
                for fact in ['Casey Example','12 amber cones deployed','10 ft','MLLW','Exercise command requires use DELTA-19']:self.assertIn(fact,text)
                self.assertNotIn('Alert if water rises > 1 ft',text)
    def test_source_omission_does_not_override_supplied_assignment(self):
        missing=dict(name='missing.txt',content='Incident commander: not named')
        evidence=build_operational_evidence(SCOPE,[missing,POSITIVE],question='CEDAR-731 cones, commander, deployment, threshold and authorized radio procedure tonight')
        self.assertTrue(any('Casey Example' in r['text'] for r in evidence['facts']))
        self.assertFalse(any('actual incident status remains unknown' in g for g in evidence['gaps']))
    def test_no_default_flood_status_or_percent_for_known_or_unknown_stations(self):
        for station in ['8518750','8516945','8510560','8531680','UNKNOWN']:
            result=get_flood_status(station,5.5)
            self.assertIn('UNAVAILABLE',result['status']);self.assertIsNone(result['pct_to_minor']);self.assertEqual(result['thresholds'],{})
    def test_every_failure_in_every_section_fails_closed(self):
        evidence=build_operational_evidence(SCOPE,[POSITIVE],question='CEDAR-731 cones, commander, deployment, threshold and authorized radio procedure tonight')
        for case in FIXTURE['cases']:
            for section in ['facts','impacts','gaps','suggestions']:
                output=render_operational_answer(json.dumps(dict(version='operational-answer-v2',**{section:[case['rejected']]})),evidence,SCOPE)
                self.assertEqual(output['disposition'],'incomplete');self.assertNotIn(case['rejected'],output['answer'])

if __name__=='__main__':unittest.main()
