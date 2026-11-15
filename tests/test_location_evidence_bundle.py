import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'streamlit'))
from request_scope import resolve_request_scope,scoped_weather
from operational_evidence import build_operational_evidence
from answer_records import render_answer_records

def project(x):
    scope=resolve_request_scope(x['question'],x['requestedAt'],x['jurisdiction'],x['weather'],selected_location=x.get('selectedLocation'))
    evidence=build_operational_evidence(scope=scope,weather=x['weather'],files=x.get('files',[]),context=x.get('context',''),question=x['question'])
    answer=render_answer_records(json.dumps(dict(version=evidence['version'],records=[])),evidence,scope)
    return dict(scope=scope,weather=scoped_weather(x['weather'],scope),evidence=evidence,answer=answer)
class BundleTests(unittest.TestCase):
    def test_shared_cases(self):
        cases=json.loads((Path(__file__).parent/'fixtures/locations/evidence-bundle.json').read_text())
        for x in cases:
            with self.subTest(x['name']):
                result=project(x);self.assertEqual(result['scope']['evidence_bundle']['version'],'location-evidence-bundle-v1')
                if x['name']=='kfrg-67-minutes':
                    self.assertEqual(result['weather'][0]['latest_reported']['age_seconds'],4030)
                    self.assertEqual(result['weather'][0]['observation']['fields'],{})
                    self.assertIn('Latest reported',result['answer']['answer'])
if __name__=='__main__':
    if '--project' in sys.argv:print(json.dumps([project(x) for x in json.load(sys.stdin)]))
    else:unittest.main()
