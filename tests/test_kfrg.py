import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'streamlit'))
from request_scope import resolve_request_scope,weather_snapshots
from config_loader import load_config
from weather_context import summarize_weather
from operational_evidence import build_operational_evidence
from answer_records import deterministic_observation_answer
DATA=json.loads((Path(__file__).parent/'fixtures/observations/kfrg-2026-11-15.json').read_text())
CONFIG=load_config();J=dict(name=CONFIG.name,timezone=CONFIG.timezone,center=list(CONFIG.center));NOW='2026-11-15T16:13:45Z';URL='https://api.weather.gov/stations/KFRG/observations/latest'
def raw():return dict(ep=dict(id='nws_obs_kfrg',url=URL,name='Republic Airport'),data=copy.deepcopy(DATA),ok=True,fetchedAt=NOW)
class KfrgTests(unittest.TestCase):
 def test_exact_query(self):
  weather=weather_snapshots([raw()],J);scope=resolve_request_scope('what is the most recent weather observations for KFRG?',NOW,J,weather)
  self.assertEqual(scope['method'],'current_observation');self.assertEqual(scope['observation_selection']['stations'],['KFRG']);self.assertEqual(scope['coverage'][0]['observed_at'],DATA['properties']['timestamp'])
 def test_real_summary(self):
  text=summarize_weather(DATA);self.assertIn(DATA['properties']['timestamp'],text);self.assertIn('22.212 (wmoUnit:km_h-1',text);self.assertIn('Clear',text);self.assertNotIn('Updated: unknown',text)
 def test_map_selection_direct(self):
  weather=weather_snapshots([raw()],J);q='Tell me about emergency considerations for KFRG — Republic Airport — Wind: 13mph from 300° (gusts 18mph) · Clear'
  scope=resolve_request_scope(q,NOW,J,weather,selection=dict(kind='nws_observation',station_id='KFRG'));self.assertEqual(scope['method'],'current_observation')
  evidence=build_operational_evidence(scope=scope,weather=weather,question=q);out=deterministic_observation_answer(evidence,scope)
  self.assertEqual(out['disposition'],'deterministic_observation');self.assertIn('KFRG',out['answer']);self.assertIn('22.21 km/h',out['answer']);self.assertIn('wind direction',out['answer']);self.assertIn('airport operating status',out['answer']);self.assertNotIn('evacuation',out['answer'])
 def test_stale_not_substituted(self):
  source=raw();source['data']['properties']['timestamp']='2026-11-15T14:00:00Z';weather=weather_snapshots([source],J);q='Most recent weather observations for KFRG?';scope=resolve_request_scope(q,NOW,J,weather)
  evidence=build_operational_evidence(scope=scope,weather=weather,question=q);self.assertIn('KFRG: the observation or source snapshot is stale. No other station was substituted.',evidence['gaps']);self.assertIsNone(deterministic_observation_answer(evidence,scope))
 def test_retrieval_failure(self):
  source=raw();source.pop('data');source['ok']=False;weather=weather_snapshots([source],J);self.assertEqual(weather[0]['failure_type'],'retrieval_failed')
  q='Latest weather observations for KFRG?';scope=resolve_request_scope(q,NOW,J,weather);evidence=build_operational_evidence(scope=scope,weather=weather,question=q);self.assertIn('KFRG: station retrieval failed. No other station was substituted.',evidence['gaps'])
 def test_selection_does_not_override_explicit_future(self):
  s=resolve_request_scope('Forecast tomorrow at KFRG',NOW,J,selection=dict(kind='nws_observation',station_id='KFRG'));self.assertNotEqual(s['method'],'current_observation')
if __name__=='__main__':unittest.main()
