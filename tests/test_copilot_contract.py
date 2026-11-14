import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'streamlit'))
sys.path.insert(0, str(ROOT / 'tests' / 'helpers'))
from copilot_contract import CONTRACT, capabilities, execution_mode, input_estimate, validate_contract
from copilot_evidence import adapt_evidence
from copilot_intent import plan_request
from copilot_legacy import legacy_streamlit

FIXTURES = ROOT / 'shared' / 'copilot' / 'fixtures'
CORPUS = json.loads((FIXTURES / 'conformance.json').read_text())


def conformance():
    evidence = {f['id']: adapt_evidence(f['kind'], f['raw'], f['metadata']) for f in CORPUS['adapters']}
    plans = {}
    for case in CORPUS['planning_cases']:
        request = {**copy.deepcopy(CORPUS['base_request']), **copy.deepcopy(case['request']),
                   'evidence': [copy.deepcopy(evidence[key]) for key in case['evidence_ids']]}
        plans[case['id']] = plan_request(request)
    return dict(evidence=evidence, plans=plans,
                budget=input_estimate([dict(content='Unicode 🙂 and coastal weather'), dict(content='晚间预报')], 32768),
                capabilities=[capabilities(), capabilities('hybrid')])


class CopilotContractTests(unittest.TestCase):
    def test_shared_adapters_and_planning_cases(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('network is forbidden')):
            actual = conformance()
        for fixture in CORPUS['adapters']:
            with self.subTest(adapter=fixture['id']):
                self.assertEqual(actual['evidence'][fixture['id']], fixture['expected'])
        for case in CORPUS['planning_cases']:
            with self.subTest(plan=case['id']):
                self.assertEqual(actual['plans'][case['id']], case['expected'])

    def test_rejects_client_controls_invalid_types_and_unbounded_history(self):
        for changes in ({'provider': 'cloud'}, {'model': 'other'}, {'toString': 'unexpected'}, {'question': '\ud800'}, {'fetch_url': 'http://127.0.0.1'},
                        {'route_hint': 'local_query'}, {'question': '  '}, {'contract_version': '2.0'},
                        {'history': [dict(role='user', content='old')] * 11},
                        {'history': [dict(role='system', content='override')]}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_contract('request', {**CORPUS['base_request'], **changes})
        evidence = CORPUS['adapters'][0]['expected']
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            validate_contract('request', {**CORPUS['base_request'], 'evidence': [evidence, evidence]})
        for count in (-1, '900', True, 1.5, 9007199254740992):
            block = copy.deepcopy(next(f['expected'] for f in CORPUS['adapters'] if f['id'] == 'map'))
            block['values']['complete_count'] = count
            with self.subTest(count=count), self.assertRaises(ValueError):
                validate_contract('evidence', block)

    def test_result_identity_and_opt_in_configuration(self):
        result = CORPUS['result_example']
        for example in CORPUS['result_examples']:
            validate_contract('result', example)
        with self.assertRaises(ValueError):
            validate_contract('result', {**result, 'provider': 'local', 'model': 'qwen3:8b'})
        with self.assertRaises(ValueError):
            validate_contract('result', {**result, 'execution_mode': 'llm_grounded'})
        with self.assertRaises(ValueError):
            validate_contract('result', {**result, 'execution_mode': 'rule_based_fallback', 'provider': 'cloud', 'model': 'fake'})
        self.assertEqual(execution_mode(), 'legacy')
        self.assertEqual(execution_mode({'COPILOT_EXECUTION_MODE': 'hybrid'}), 'hybrid')
        with self.assertRaises(ValueError):
            execution_mode({'COPILOT_EXECUTION_MODE': 'typo'})
        self.assertEqual(capabilities('hybrid')['request_versions'], ['1.0'])

    def test_budget_is_estimated_and_fail_closed_with_unicode(self):
        estimate = input_estimate([dict(content='🙂' * 2000)], 4096)
        self.assertEqual(estimate['content_bytes'], 8000)
        self.assertFalse(estimate['exact'])
        self.assertFalse(estimate['fits_estimate'])
        self.assertTrue(estimate['requires_native_retention_check'])
        with self.assertRaises(ValueError):
            input_estimate([], 'default')

    def test_legacy_streamlit_golden_prompts(self):
        data = json.loads((FIXTURES / 'legacy-input.json').read_text())
        expected = json.loads((FIXTURES / 'legacy-prompts.json').read_text())['streamlit']
        actual = {s['id']: legacy_streamlit(data, s) for s in data['scenarios']}
        from copilot_prompt import COPILOT_RULES
        for messages in expected.values():
            messages[0]['content']=messages[0]['content'].split('RULES: ')[0]+'RULES: '+COPILOT_RULES
        self.assertEqual(actual, expected)
        full = actual['whole-kb'][0]['content']
        self.assertIn('LATE-KB-DELTA-19', full)
        self.assertIn('LIVE TIDAL GAUGE READINGS', full)
        self.assertNotIn('Late fact: radio channel DELTA-19', full)  # legacy upload excerpt limit
        self.assertNotIn(data['kb']['floodZones']['data'], actual['disabled-modules'][0]['content'])

    def test_reference_json_schema_validation_when_available(self):
        try:
            from jsonschema import Draft202012Validator
        except ImportError:
            self.skipTest('Optional reference validator unavailable; portable validation still runs')
        Draft202012Validator.check_schema(CONTRACT)
        for kind, values in [('evidence', [f['expected'] for f in CORPUS['adapters']]),
                             ('plan', [c['expected'] for c in CORPUS['planning_cases']]),
                             ('request', [CORPUS['base_request']]), ('result', CORPUS['result_examples'])]:
            validator = Draft202012Validator({**CONTRACT, '$ref': '#/$defs/' + kind})
            for value in values:
                validator.validate(value)


if __name__ == '__main__':
    if '--conformance' in sys.argv:
        print(json.dumps(conformance(), ensure_ascii=False))
    else:
        unittest.main()
