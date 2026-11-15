import json,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from copilot_prompt import build_copilot_system_prompt
from request_scope import resolve_request_scope
from tests.test_cloud_uploads import scope,requests
FIXTURE=json.loads((ROOT/'shared/grounding-regressions.json').read_text())
CAPTURED=json.loads((ROOT/FIXTURE['input_capture']).read_text())

class GroundingTests(unittest.TestCase):
    def test_all_reported_failures_and_supported_conditional_analysis_reach_prompt(self):
        prompt=build_copilot_system_prompt('Long Island','explicitly supplied SOP and asset specifications')
        for case in FIXTURE['cases']:
            with self.subTest(case=case['id']):self.assertIn(case['required_rule'],prompt)
        self.assertIn(FIXTURE['conditional_analysis'],prompt)
        self.assertIn(FIXTURE['positive_evidence_rule'],prompt)
        self.assertIn('a later caveat does not repair an earlier unsupported claim',prompt)

    def test_same_mixed_request_delivers_full_document_and_contract_to_recording_provider(self):
        jurisdiction=dict(name='Long Island',timezone='America/New_York',center=[40.7891,-73.135])
        weather=CAPTURED['scope_input']['weather']
        resolved=resolve_request_scope(FIXTURE['question'],FIXTURE['requested_at'],jurisdiction,weather,CAPTURED['uploads'])
        self.assertEqual(resolved['status'],'resolved')
        self.assertEqual(resolved['interval']['start_utc'],'2026-11-14T23:00:00Z')
        self.assertEqual(resolved['interval']['end_utc'],'2026-11-15T11:00:00Z')
        with patch.object(requests,'post') as post:
            response=post.return_value.__enter__.return_value
            response.iter_lines.return_value=[json.dumps(dict(message=dict(content=json.dumps(dict(version='operational-answer-v2',records=[]))),done=True)).encode()]
            output=''.join(scope['stream_ollama']([dict(role='user',content=FIXTURE['question'])],CAPTURED['messages'][0]['content'],resolved,weather))
            self.assertIn('## ',output);self.assertEqual(post.call_count,1)
            prompt=post.call_args.kwargs['json']['messages'][0]['content']
            for case in FIXTURE['cases']:self.assertIn(case['required_rule'],prompt)
            for upload in CAPTURED['uploads']:self.assertIn(upload['content'],prompt)
            self.assertIn(FIXTURE['conditional_analysis'],prompt)

if __name__=='__main__':unittest.main()
