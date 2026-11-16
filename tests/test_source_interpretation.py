import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'streamlit'))
from request_scope import resolve_request_scope
from location_synthesis import build_synthesis_checkpoint,render_synthesis_proposal,SYNTHESIS_VERSION

def project(x):
    scope=resolve_request_scope(x['question'],x['requestedAt'],x['jurisdiction'],x['weather'],selected_location=x.get('selectedLocation'),local_jurisdiction=x.get('localJurisdiction'))
    cp=build_synthesis_checkpoint(scope,files=x.get('files'),weather=x['weather'],context=x['context'],question=x['question'])
    proposal=dict(version=SYNTHESIS_VERSION,statements=[c['proposal'] for c in cp['candidates']][:32])
    return dict(checkpoint=cp,proposal=proposal,rendered=render_synthesis_proposal(json.dumps(proposal),cp))
class SourceInterpretationTests(unittest.TestCase):
    def test_retained_sources_and_rejected_transformations(self):
        cases=json.loads((Path(__file__).parent/'fixtures/locations/source-adapters.json').read_text())
        for x in cases:
            with self.subTest(x['name']):
                p=project(x);cp=p['checkpoint'];self.assertEqual(p['rendered']['validation']['operational_verification'],'not_established')
                for c in cp['candidates']:
                    if c['proposal']['category']!='source_assertion':continue
                    attack=dict(c['proposal'],interpretation='authorize_local_actions')
                    out=render_synthesis_proposal(json.dumps(dict(version=SYNTHESIS_VERSION,statements=[attack])),cp)
                    self.assertEqual(len(out['validation']['claims']['rejected']),1)
if __name__=='__main__':
    if '--project' in sys.argv:print(json.dumps([project(x) for x in json.load(sys.stdin)]))
    else:unittest.main()
