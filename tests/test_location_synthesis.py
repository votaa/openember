import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'streamlit'))
from request_scope import resolve_request_scope
from location_synthesis import build_synthesis_checkpoint,render_synthesis_proposal,synthesis_instruction,SYNTHESIS_VERSION

def project(x):
    scope=resolve_request_scope(x['question'],x['requestedAt'],x['jurisdiction'],x['weather'],selected_location=x.get('selectedLocation'))
    cp=build_synthesis_checkpoint(scope,files=x.get('files'),weather=x['weather'],context=x.get('context',''),question=x['question'])
    proposal=dict(version=SYNTHESIS_VERSION,statements=[c['proposal'] for c in cp['candidates']])
    bad=dict(category='conditional_consideration',claim_id='invented',source_id='s0',interpretation='mandatory_evacuation',value='25 mph')
    adversarial=dict(version=SYNTHESIS_VERSION,statements=[bad]+proposal['statements'])
    return dict(checkpoint=cp,proposal=proposal,instruction=synthesis_instruction(cp),rendered=render_synthesis_proposal(json.dumps(proposal),cp),rejected=render_synthesis_proposal(json.dumps(adversarial),cp),incomplete=render_synthesis_proposal('',cp,False))
class SynthesisTests(unittest.TestCase):
    def test_shared_cases(self):
        cases=json.loads((Path(__file__).parent/'fixtures/locations/synthesis-checkpoint.json').read_text())
        for x in cases:
            with self.subTest(x['name']):
                p=project(x)
                self.assertEqual(len(p['rejected']['validation']['claims']['rejected']),1)
                self.assertEqual(p['rejected']['validation']['operational_verification'],'not_established')
                self.assertNotIn('25 mph',p['rejected']['answer'])
    def test_boolean_cannot_be_replaced_by_number(self):
        x=json.loads((Path(__file__).parent/'fixtures/locations/synthesis-checkpoint.json').read_text())[0];p=project(x);cp=p['checkpoint']
        item=next(c['proposal'].copy() for c in cp['candidates'] if c['proposal']['category']=='source_assertion');item['value']=1
        out=render_synthesis_proposal(json.dumps(dict(version=SYNTHESIS_VERSION,statements=[item])),cp)
        self.assertEqual(len(out['validation']['claims']['rejected']),1)
if __name__=='__main__':
    if '--project' in sys.argv:print(json.dumps([project(x) for x in json.load(sys.stdin)]))
    else:unittest.main()
