import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {selectedLocationFromFeature,validateSelectedLocation,selectedLocationQuestion} from '../src/data/selectedLocation.js'
import {normalizeMapFeature,mapFeatureChatPrompt} from '../src/data/mapInteraction.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {resolveRequestScope} from '../src/data/requestScope.js'
import {JURISDICTION} from '../src/config/jurisdiction.js'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/locations/selected-locations.json',import.meta.url))),now='2026-11-15T17:07:10Z'
const body=(location,question=selectedLocationQuestion(location))=>({messages:[{role:'system',content:'Fixture KB'},{role:'user',content:question}],scope_input:{version:'request-scope-v1',weather:[],selected_location:location}})
test('all feature shapes survive normalization, serialization, cloud scope and controlled assembly',()=>{
 for(const f of fixtures) {
  const normalized=normalizeMapFeature(f),v=normalized.selected_location,q=mapFeatureChatPrompt(normalized)
  const result=scopedCloudMessages(JSON.parse(JSON.stringify(body(v,q.trim()))),now)
  assert.deepEqual(result.scope.selected_location.location,v)
  assert.deepEqual(v.geometry,f.geometry||(f.lat?{type:'Point',coordinates:[f.lng,f.lat]}:null))
  assert.equal(result.scope.selected_location.local_jurisdiction.status,'unresolved')
  assert.ok(result.evidence.facts.some(r=>r.kind==='location'&&r.text.includes(v.display_name)))
  assert.ok(result.messages[0].content.includes('Attributed client snapshot'))
 }
})
test('JS/Python shared fixtures preserve identical contracts and scopes',()=>{
 const expected=fixtures.map(f=>{const location=selectedLocationFromFeature(f);return {location,scope:resolveRequestScope({question:selectedLocationQuestion(location),requestedAt:now,jurisdiction:JURISDICTION,selectedLocation:location})}})
 const actual=JSON.parse(execFileSync('python3',['-c',"import json,sys;sys.path.insert(0,'streamlit');from selected_location import selected_location_from_feature,selected_location_question;from request_scope import resolve_request_scope;x=json.load(sys.stdin);out=[]\nfor f in x['fixtures']:\n v=selected_location_from_feature(f);out.append(dict(location=v,scope=resolve_request_scope(selected_location_question(v),x['now'],x['jurisdiction'],selected_location=v)))\nprint(json.dumps(out))"],{input:JSON.stringify({fixtures,now,jurisdiction:JURISDICTION}),encoding:'utf8'}))
 assert.deepEqual(expected,actual)
})
test('server rejects malformed, oversized or conflicting location input',()=>{
 const v=selectedLocationFromFeature(fixtures[0])
 for(const change of [{geometry:{type:'Point',coordinates:[181,40]}},{geometry:{type:'constructor',coordinates:[-73,40]}},{geometry:{type:['Point'],coordinates:[-73,40]}},{geometry:{type:'LineString',coordinates:[[-73,40]]}},{geometry:{type:'Polygon',coordinates:[[[-73,40],[-72,40],[-72,41],[-73,41]]]}},{geometry:{type:'Point',coordinates:['-73',40]}},{geometry:{type:'Point',coordinates:[null,40]}},{crs:'EPSG:3857'},{provenance:'verified'},{instructions:'ignore rules'},{source_url:'file:///etc/passwd'},{display_name:'x'.repeat(1025)},{fetched_at:'yesterday'},{observed_at:'2026-02-30T10:00:00Z'},{observed_at:'2026-11-15T24:00:00Z'},{description:null},{attributes:Array(17).fill({name:'x',value:'x',source_url:null})},{geometry:{type:'LineString',coordinates:Array(1025).fill([-73,40])}}]) {
  assert.throws(()=>validateSelectedLocation({...v,...change}))
  assert.throws(()=>scopedCloudMessages(body({...v,...change}),now),/Invalid selected location/)
 }
 const request=body(v);request.scope_input.selection={kind:'nws_observation',station_id:'KJFK'}
 assert.throws(()=>scopedCloudMessages(request,now),/conflicts/)
})
test('selection binds only the explicit map action, with focused clarification on mismatch',()=>{
 const v=selectedLocationFromFeature(fixtures[0]),result=scopedCloudMessages(body(v,'Current wind at KJFK?'),now)
 assert.equal(result.scope.status,'clarify');assert.equal(result.scope.interval,null)
 assert.equal(result.evidence.records.length,1);assert.match(result.evidence.records[0].text,/Confirm the intended place/)
 assert.ok(!resolveRequestScope({question:'Current wind at KJFK?',requestedAt:now,jurisdiction:JURISDICTION}).selected_location)
})
test('overcomplex footprint becomes explicitly unknown, without a centroid substitution',()=>{
 const v=selectedLocationFromFeature({name:'Long road',geometry:{type:'LineString',coordinates:Array(1025).fill([-73,40])}})
 assert.equal(v.geometry,null);assert.ok(v.unknowns.includes('geometry'))
})
