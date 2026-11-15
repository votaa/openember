import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'streamlit'))
from request_scope import resolve_request_scope
from operational_evidence import build_operational_evidence,render_operational_answer
from answer_records import deterministic_observation_answer
from kb_answer_records import CATALOG
J=dict(name='Long Island',timezone='America/New_York',center=[40.7891,-73.135]);NOW='2026-11-15T16:13:45Z'
QUESTION='Tell me about emergency considerations for KFRG — Republic Airport — Wind: 13mph from 300° (gusts 18mph) · Clear'
def context(rows=None):return ''.join(f"--- {r['header']} ---\n{r['source_text']}\n\n" for r in (CATALOG['modules'] if rows is None else rows))
def answer(ctx,question=QUESTION):
 scope=resolve_request_scope(question,NOW,J,selection=dict(kind='nws_observation',station_id='KFRG'))
 e=build_operational_evidence(scope=scope,question=question,context=ctx)
 return render_operational_answer(json.dumps(dict(version=e['version'],records=[])),e,scope)['answer']
class EmergencyContextTests(unittest.TestCase):
 def test_enabled_context_appears_in_answer(self):
  a=answer(context())
  for text in ('Regional KB context','Flooding','Evacuation','Nassau University Medical Center','Coordination','not a site-specific zone assignment'):self.assertIn(text,a)
  for text in ('mandatory evacuation ANY','Heat Index','evacuate Cat'):self.assertNotIn(text,a)
 def test_disabled_context_not_invented(self):
  a=answer(context([]));self.assertNotIn('Nassau University Medical Center',a);self.assertIn('no enabled module',a)
 def test_changed_context_requires_review(self):
  a=answer(context().replace('Nassau University Medical Center','Invented Hospital'));self.assertNotIn('Invented Hospital',a);self.assertNotIn('Nassau University Medical Center',a);self.assertIn('source revision',a)
 def test_weather_readout_does_not_expand_context(self):
  a=answer(context(),'Most recent weather observations for KFRG?');self.assertNotIn('Regional KB context',a);self.assertNotIn('Evacuation',a)
if __name__=='__main__':unittest.main()
