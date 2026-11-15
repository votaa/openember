import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JURISDICTION} from '../src/config/jurisdiction.js'
import {resolveRequestScope,weatherSnapshots} from '../src/data/requestScope.js'
import {summarizeWeather} from '../src/data/weatherContext.js'
import {normalizeMapFeature,mapFeatureChatPrompt} from '../src/data/mapInteraction.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import handler from '../api/chat.js'
const data=JSON.parse(readFileSync(new URL('./fixtures/observations/kfrg-2026-11-15.json',import.meta.url))),now='2026-11-15T16:13:45Z',url='https://api.weather.gov/stations/KFRG/observations/latest'
const snapshot=()=>weatherSnapshots([{ep:{id:'nws_obs_kfrg',url,name:'Republic Airport'},data,ok:true,fetchedAt:now}],JURISDICTION)[0]
const body=(question,selection)=>({messages:[{role:'system',content:'Fixture KB'},{role:'user',content:question}],scope_input:{version:'request-scope-v1',weather:[snapshot()],selection}})
test('exact hosted most recent wording selects current KFRG observations',()=>{
 const s=resolveRequestScope({question:'what is the most recent weather observations for KFRG?',requestedAt:now,jurisdiction:JURISDICTION,weather:[snapshot()]})
 assert.equal(s.method,'current_observation');assert.deepEqual(s.observation_selection.stations,['KFRG']);assert.equal(s.coverage[0].observed_at,data.properties.timestamp)
})
test('real observation source summary retains timestamp, measured fields and units rather than treating it as a grid',()=>{
 const text=summarizeWeather(data);assert.ok(text.includes(data.properties.timestamp));assert.match(text,/22\.212.*wmoUnit:km_h-1/);assert.match(text,/Clear/);assert.ok(!text.includes('Updated: unknown'))
})
test('map handoff retains payload and resolves time/station independently of its display wording',()=>{
 const feature=normalizeMapFeature({name:'KFRG — Republic Airport',description:'Wind: 13mph from 300° (gusts 18mph) · Clear',observation:snapshot()})
 assert.deepEqual(feature.observation,snapshot())
 const out=scopedCloudMessages(body(mapFeatureChatPrompt(feature),{kind:'nws_observation',station_id:'KFRG'}),now)
 assert.equal(out.scope.method,'current_observation');assert.deepEqual(out.scope.observation_selection.stations,['KFRG']);assert.ok(out.evidence.facts.some(r=>r.kind==='observation'))
})
test('simple eligible observation answer does not call provider',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('provider must not be called')}
 try {
  // Use the actual handler clock for this isolated fixture; historical fixture stays immutable.
  const request=body('what is the most recent weather observations for KFRG?');const clock=new Date(Date.now()-1000).toISOString();request.scope_input.weather[0].fetched_at=clock;request.scope_input.weather[0].data=structuredClone(data);request.scope_input.weather[0].data.properties.timestamp=clock
  const r=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(request)}));assert.equal(r.status,200)
  const text=await r.text();assert.ok(text.includes('deterministic_observation'));assert.ok(text.includes('KFRG'));assert.ok(!text.includes('Incomplete answer'))
 }finally{globalThis.fetch=old}
})

import {execFileSync} from 'node:child_process'
import {buildOperationalEvidence,renderOperationalAnswer} from '../src/data/operationalEvidence.js'
import {deterministicObservationAnswer} from '../src/data/answerRecords.js'
test('selected map evidence and controlled assessment have JS/Python parity',()=>{
 const q='Tell me about emergency considerations for KFRG — Republic Airport — Wind: 13mph from 300° (gusts 18mph) · Clear',selection={kind:'nws_observation',station_id:'KFRG'},weather=[snapshot()]
 const scope=resolveRequestScope({question:q,requestedAt:now,jurisdiction:JURISDICTION,weather,selection}),evidence=buildOperationalEvidence({scope,weather,question:q}),direct=deterministicObservationAnswer(evidence,scope)
 const py=JSON.parse(execFileSync('python3',['-c',"import json,sys;sys.path.insert(0,'streamlit');from request_scope import resolve_request_scope;from operational_evidence import build_operational_evidence;from answer_records import deterministic_observation_answer;x=json.load(sys.stdin);s=resolve_request_scope(x['question'],x['now'],x['jurisdiction'],x['weather'],selection=x['selection']);e=build_operational_evidence(scope=s,weather=x['weather'],question=x['question']);print(json.dumps(dict(scope=s,evidence=e,direct=deterministic_observation_answer(e,s))))"],{input:JSON.stringify({question:q,now,jurisdiction:JURISDICTION,weather,selection}),encoding:'utf8'}))
 assert.deepEqual({scope,evidence,direct},py)
})
test('failed retrieval, malformed payload and stale measurements produce specific station gaps',()=>{
 for(const [variant,expected] of [['failed','station retrieval failed'],['invalid','missing a valid timestamp'],['stale','observation or source snapshot is stale'],['mismatch','station identity does not match']]) {
  let source=snapshot()
  if(variant==='failed')source=weatherSnapshots([{ep:{id:source.id,url,name:'Republic Airport'},ok:false,fetchedAt:now}],JURISDICTION)[0]
  if(variant==='invalid')source=weatherSnapshots([{ep:{id:source.id,url,name:'Republic Airport'},ok:true,data:{properties:{windSpeed:{value:10,unitCode:'wmoUnit:km_h-1'}}},fetchedAt:now}],JURISDICTION)[0]
  if(variant==='stale'){source=structuredClone(source);source.data.properties.timestamp='2026-11-15T14:00:00Z'}
  if(variant==='mismatch'){source=structuredClone(source);source.data.properties.station='https://api.weather.gov/stations/KJFK'}
  const request=body('Most recent weather observations for KFRG?');request.scope_input.weather=[source]
  const out=scopedCloudMessages(request,now),answer=renderOperationalAnswer(JSON.stringify({version:out.evidence.version,records:[]}),out.evidence,out.scope).answer
  assert.ok(answer.includes(expected),variant+': '+answer);assert.ok(!out.evidence.facts.some(r=>r.kind==='observation'));assert.equal(deterministicObservationAnswer(out.evidence,out.scope),null)
 }
})
test('selection is catalog bounded and does not replace an explicit future interval',()=>{
 assert.throws(()=>scopedCloudMessages(body('What conditions?',{kind:'nws_observation',station_id:'FAKE'}),now),/Invalid selected/)
 const out=scopedCloudMessages(body('Forecast tomorrow at KFRG',{kind:'nws_observation',station_id:'KFRG'}),now)
 assert.notEqual(out.scope.method,'current_observation');assert.equal(deterministicObservationAnswer(out.evidence,out.scope),null)
})
