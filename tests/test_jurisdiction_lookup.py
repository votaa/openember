import json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from jurisdiction_lookup import POLICY,boundary_query,lookup_jurisdiction,normalize_boundary_response
from selected_location import selected_location_from_feature,selected_location_question
from request_scope import resolve_request_scope
from operational_evidence import build_operational_evidence,render_operational_answer
FIXTURES={str(l['layer_id']):json.loads((ROOT/f"tests/fixtures/jurisdiction/kfrg-{l['layer_id']}.json").read_text()) for l in POLICY['layers']}
NOW='2026-11-15T20:00:00.000Z'
J=dict(name='Long Island',timezone='America/New_York',center=[40.7891,-73.135])
def location():return selected_location_from_feature(dict(name='KFRG — Republic Airport',station_id='KFRG',geometry=dict(type='Point',coordinates=[-73.4134,40.7288])))
def fetch(url,params):return FIXTURES[url.split('/')[-2]]
class JurisdictionLookupTests(unittest.TestCase):
 def test_kfrg_in_scope_and_controlled_answer(self):
  v=location();q=selected_location_question(v);j=lookup_jurisdiction(v,q,fetch_layer=fetch,clock=lambda:NOW)
  self.assertEqual(j['names'],['County: Suffolk','Town: Babylon']);self.assertEqual(j['status'],'matched')
  s=resolve_request_scope(q,NOW,J,selected_location=v,local_jurisdiction=j);e=build_operational_evidence(s,question=q)
  a=render_operational_answer(json.dumps(dict(version=e['version'],records=[])),e,s)['answer']
  self.assertIn('County: Suffolk; Town: Babylon',a);self.assertIn('emergency authority are not established',a)
 def test_full_multipart_and_polygon_holes(self):
  shapes=[dict(type='MultiLineString',coordinates=[[[-74,40],[-72,41]],[[-73,40],[-71,41]]]),dict(type='MultiPolygon',coordinates=[[[[0,0],[3,0],[3,3],[0,0]],[[1,1],[2,2],[2,1],[1,1]]],[[[5,0],[6,0],[6,1],[5,0]]]])]
  for g in shapes:
   params=boundary_query(g,POLICY['layers'][0]);out=json.loads(params['geometry'])
   self.assertEqual(params['inSR'],'4326');self.assertEqual(params['spatialRel'],'esriSpatialRelIntersects')
   if g['type']=='MultiLineString':self.assertEqual(out['paths'],g['coordinates'])
   else:self.assertEqual(len(out['rings']),3)
 def test_no_name_geocoding_and_no_question_carryover(self):
  for v,q in [(selected_location_from_feature(dict(name='Babylon')),None),(location(),'Current KJFK conditions?')]:
   j=lookup_jurisdiction(v,q or selected_location_question(v),fetch_layer=lambda *args:self.fail('Unexpected egress'))
   self.assertEqual(j['names'],[]);self.assertEqual(j['status'],'unresolved')
 def test_failed_or_incomplete_source_retains_other_levels_without_county_guess(self):
  v=location()
  for bad in [dict(error=dict(message='failed')),dict(features=[],exceededTransferLimit=True),dict(features=[dict(attributes=dict(OBJECTID=True))])]:
   j=lookup_jurisdiction(v,selected_location_question(v),fetch_layer=lambda url,p:bad if '/2/' in url else fetch(url,p),clock=lambda:NOW)
   self.assertEqual(j['status'],'partial');self.assertEqual(j['names'],['Town: Babylon'])
   self.assertEqual(j['levels'][0]['status'],'unavailable')
 def test_source_modified_time_is_not_fetch_time(self):
  raw=dict(features=[dict(attributes=dict(OBJECTID=52,NAME='Suffolk',FIPS_CODE='36103',DATEMOD=1774393627167))])
  j=normalize_boundary_response(raw,POLICY['layers'][0],NOW)
  self.assertEqual(j['fetched_at'],NOW);self.assertEqual(j['matches'][0]['source_modified_at'],'2026-03-24T23:07:07.167Z')
 def test_real_village_composite_identifier(self):
  raw=json.loads((ROOT/'tests/fixtures/jurisdiction/crossing-villages.json').read_text())
  m=normalize_boundary_response(raw,POLICY['layers'][2],NOW)['matches'][0]
  self.assertEqual(m['name'],'Farmingdale');self.assertEqual(m['fips'],'360595600025384')
