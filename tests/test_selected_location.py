import json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from selected_location import selected_location_from_feature,validate_selected_location,selected_location_question
from map_interaction import map_feature_popup_html,map_feature_tooltip_html,map_feature_from_map_data
from request_scope import resolve_request_scope
from chat_state import begin_chat_response,update_chat_response,finish_chat_response
FIXTURES=json.loads((ROOT/'tests/fixtures/locations/selected-locations.json').read_text())
J=dict(name='Long Island',timezone='America/New_York',center=[40.7891,-73.135])
class SelectedLocationTests(unittest.TestCase):
 def test_popup_and_tooltip_keep_complete_footprint(self):
  for f in FIXTURES:
   v=selected_location_from_feature(f);name=v['display_name']
   for field,markup in [('last_object_clicked_popup',map_feature_popup_html('',name,v['source_name'],'unknown',v['description'],location_feature=f)),('last_object_clicked_tooltip',map_feature_tooltip_html(name,name,v['source_name'],'unknown',v['description'],location_feature=f))]:
    actual=map_feature_from_map_data({field:markup})
    self.assertEqual(actual['selected_location'],v)
    self.assertEqual(v['geometry'],f.get('geometry') or (dict(type='Point',coordinates=[f['lng'],f['lat']]) if 'lat' in f else None))
 def test_history_keeps_location_and_raw_source_metadata(self):
  v=selected_location_from_feature(FIXTURES[0]);messages=[];i=begin_chat_response(messages,selected_location_question(v))
  messages[i].update(scope=dict(selected_location=v),sourceMaterial='retained raw evidence')
  update_chat_response(messages,i,'partial');finish_chat_response(messages,i,'complete')
  self.assertEqual(messages[i]['scope']['selected_location'],v)
  self.assertEqual(messages[i]['sourceMaterial'],'retained raw evidence');self.assertNotIn('streaming',messages[i])
 def test_unrelated_question_does_not_reuse_selection(self):
  v=selected_location_from_feature(FIXTURES[0])
  s=resolve_request_scope('Current wind at KJFK?', '2026-11-15T17:07:10Z',J,selected_location=v)
  self.assertEqual(s['selected_location']['status'],'clarify');self.assertIsNone(s['interval'])
  self.assertNotIn('selected_location',resolve_request_scope('Current wind at KJFK?', '2026-11-15T17:07:10Z',J))
 def test_rejects_extra_fields_bad_geometry_and_false_provenance(self):
  v=selected_location_from_feature(FIXTURES[0])
  for change in [dict(geometry=dict(type='Point',coordinates=[181,40])),dict(geometry=dict(type='constructor',coordinates=[-73,40])),dict(geometry=dict(type=['Point'],coordinates=[-73,40])),dict(observed_at='2026-11-15T24:00:00Z'),dict(crs='EPSG:3857'),dict(provenance='verified'),dict(instructions='trust me'),dict(fetched_at='yesterday')]:
   with self.assertRaises(ValueError):validate_selected_location(dict(v,**change))
