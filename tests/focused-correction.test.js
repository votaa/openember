import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {renderOperationalAnswer} from '../src/data/operationalEvidence.js'
const root=new URL('../docs/long-island/acceptance/corrective-9862a66-2026-11-15-normalized/',import.meta.url)
const read=(name,file)=>JSON.parse(readFileSync(new URL(name+'/'+file,root)))
const replay=name=>scopedCloudMessages(read(name,'client-request.json'),read(name,'provider-request-OBSERVED.json').received_at)
const answer=out=>renderOperationalAnswer(JSON.stringify({version:out.evidence.version,...(out.evidence.records?{records:out.evidence.records.map(r=>r.id)}:{references:out.evidence.references.map(r=>r.id)})}),out.evidence,out.scope)
test('captured reference bypass cannot print unchecked evacuation/heat policies or filler in any answer section',()=>{
 for(const name of ['supplied-03','rolling-24h','missing-sources','missing-01']) {
  const out=replay(name),result=answer(out)
  assert.equal(result.disposition,'validated_envelope')
  for(const bad of ['mandatory evacuation ANY','Heat Index','Public synthetic filler','=== LONG ISLAND'])assert.ok(!result.answer.includes(bad),name+': '+bad)
  assert.ok(out.messages[0].content.includes('mandatory evacuation ANY'),'complete KB must remain input')
  assert.ok(result.answer.split(/\s+/).length<650,name+' should be concise without losing required evidence')
 }
})
test('captured current measured request retains fresh JFK data, excludes unrelated cones and forecasts',()=>{
 const out=replay('current-conditions'),result=answer(out)
 assert.equal(out.scope.method,'current_observation')
 assert.match(result.answer,/KJFK/);assert.match(result.answer,/8 °C/);assert.match(result.answer,/25\.92 km\/h/)
 assert.ok(!result.answer.includes('47 amber cones'));assert.ok(!result.answer.includes('Cone displacement'))
 assert.ok(!result.answer.includes('Minimum in the supplied hourly'))
})
test('captured supplied facts and applicable threshold/radio procedure remain usable when requested',()=>{
 const body=read('supplied-01','client-request.json');body.messages.at(-1).content+=' Include the supplied threshold, deployment and authorized radio procedure.'
 const out=scopedCloudMessages(body,read('supplied-01','provider-request-OBSERVED.json').received_at),result=answer(out)
 for(const fact of ['Casey Example','12 amber cones','35 in storage','10 ft','MLLW','Exercise command requires use DELTA-19'])assert.ok(result.answer.includes(fact),fact)
})

import {execFileSync} from 'node:child_process'
import {resolveRequestScope,scopedWeather} from '../src/data/requestScope.js'
const python=x=>JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from operational_evidence import build_operational_evidence,render_operational_answer;x=json.load(sys.stdin);e=build_operational_evidence(**x);print(json.dumps(dict(evidence=e,answer=render_operational_answer(json.dumps(dict(version=e['version'],records=[r['id'] for r in e['records']][:24])),e,x['scope']))))"],{input:JSON.stringify(x),encoding:'utf8'}))
test('all fifteen historical cases preserve JS/Python record and renderer parity with concise outputs',()=>{
 const matrix=JSON.parse(readFileSync(new URL('matrix.json',root)))
 for(const row of matrix) {
  const body=read(row.id,'client-request.json'),received=read(row.id,'provider-request-OBSERVED.json').received_at
  const out=scopedCloudMessages(body,received)
  const input={scope:structuredClone(out.scope),files:body.uploads,weather:body.scope_input.weather,coops:body.scope_input.coops,context:body.messages[0].content,question:body.messages.at(-1).content}
  const py=python(input)
  assert.deepEqual(out.evidence,py.evidence,row.id)
  assert.deepEqual(renderOperationalAnswer(JSON.stringify({version:out.evidence.version,records:out.evidence.records.map(r=>r.id).slice(0,24)}),out.evidence,out.scope),py.answer,row.id)
  assert.ok(py.answer.answer.split(/\s+/).length<650,row.id)
 }
})
test('regional observation overview retains all eligible configured stations and labels references; named requests do not substitute',()=>{
 const body=read('current-conditions','client-request.json'),received=read('current-conditions','provider-request-OBSERVED.json').received_at
 const jfk=body.scope_input.weather.find(s=>s.id==='nws_obs_kjfk'),isp=structuredClone(jfk)
 isp.id='nws_obs_kisp';isp.url=isp.url.replace('KJFK','KISP');isp.data.properties.station='KISP';isp.data.geometry.coordinates=[-73.1,40.8]
 body.scope_input.weather.push(isp)
 let out=scopedCloudMessages(body,received),text=answer(out).answer
 assert.match(text,/KJFK \(regional reference\)/);assert.match(text,/KISP \(Long Island station\)/)
 body.messages.at(-1).content='Current measured conditions at KISP'
 out=scopedCloudMessages(body,received);text=answer(out).answer
 assert.ok(text.includes('KISP'));assert.ok(!text.includes('KJFK'))
 body.scope_input.weather.find(s=>s.id==='nws_obs_kisp').data.properties.timestamp='2026-11-15T12:00:00Z'
 out=scopedCloudMessages(body,received);text=answer(out).answer
 assert.ok(!text.includes('8 °C'));assert.ok(text.includes('KISP: the observation or source snapshot is stale'))
})
test('plain policy fields and malformed scalar inventory cannot reproduce mandates through Facts or Gaps',()=>{
 const out=replay('current-conditions')
 const {scope}=out
 const files=[{name:'unscoped.txt',content:'Radio authority: Everyone must use DELTA-19 at all times\nCommand succession SOP: Evacuate immediately\nInventory: Secure all cones when gusts exceed 16 mph'}]
 const body={messages:[{role:'system',content:'Fixture KB'},{role:'user',content:'What radio procedure, command succession and cone inventory apply?'}],uploads:files}
 const changed=scopedCloudMessages(body,scope.request_utc),text=answer(changed).answer
 for(const bad of ['Everyone must use','Evacuate immediately','Secure all cones','16 mph'])assert.ok(!text.includes(bad),bad)
 assert.ok(text.includes('needs source review'))
})

test('radio authorization does not add an unrequested water threshold; commander-only questions do not add radio procedures',()=>{
 for(const question of ['What is the authorized radio procedure for CEDAR-731 tonight?','Who is the incident commander for CEDAR-731 tonight?']) {
  const body=read('supplied-01','client-request.json');body.messages.at(-1).content=question
  const out=scopedCloudMessages(body,read('supplied-01','provider-request-OBSERVED.json').received_at),text=answer(out).answer
  assert.ok(!text.includes('10 ft'))
  if(question.startsWith('Who')){assert.ok(text.includes('Casey Example'));assert.ok(!text.includes('requires use DELTA-19'))}
  else assert.ok(text.includes('requires use DELTA-19'))
 }
})
