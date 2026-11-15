import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {buildOperationalEvidence,renderOperationalAnswer} from '../src/data/operationalEvidence.js'
import {deterministicObservationAnswer} from '../src/data/answerRecords.js'
import {resolveRequestScope,weatherSnapshots} from '../src/data/requestScope.js'
import {JURISDICTION} from '../src/config/jurisdiction.js'
const cfg=JSON.parse(readFileSync(new URL('../config/jurisdiction.generated.json',import.meta.url)))
const headers={flood_zones:'Flood Zones [FEMA / Local]',evac_zones:'Evacuation Zones [Local OEM]',critical_infrastructure:'Critical Infrastructure [Local OEM]',resources:'Contacts & Resources [Local OEM]'}
const context=keys=>keys.map(k=>`--- ${headers[k]} ---\n${cfg.knowledge_base[k]}\n\n`).join('')
const q='Tell me about emergency considerations for KFRG — Republic Airport — Wind: 13mph from 300° (gusts 18mph) · Clear',now='2026-11-15T16:13:45Z'
const data=JSON.parse(readFileSync(new URL('./fixtures/observations/kfrg-2026-11-15.json',import.meta.url)))
function input(question=q,keys=Object.keys(headers)){
 const weather=weatherSnapshots([{ep:{id:'nws_obs_kfrg',url:'https://api.weather.gov/stations/KFRG/observations/latest',name:'Republic Airport'},data,ok:true,fetchedAt:now}],JURISDICTION)
 const scope=resolveRequestScope({question,requestedAt:now,jurisdiction:JURISDICTION,weather,selection:{kind:'nws_observation',station_id:'KFRG'}})
 return {scope,weather,context:context(keys),question}
}
const render=x=>{const evidence=buildOperationalEvidence(x);return {evidence,result:renderOperationalAnswer(JSON.stringify({version:evidence.version,records:[]}),evidence,x.scope)}}
test('map-generated emergency request includes supported flooding, evacuation and facilities in the answer, not only raw sources',()=>{
 const x=input(),{evidence,result}=render(x)
 assert.equal(deterministicObservationAnswer(evidence,x.scope),null)
 for(const text of ['Regional KB','Flooding','Evacuation','Critical facilities','Nassau University Medical Center','KFRG'])assert.ok(result.answer.includes(text),text)
 assert.ok(!result.answer.includes('mandatory evacuation ANY'));assert.ok(!result.answer.includes('Heat Index'));assert.ok(result.answer.split(/\s+/).length<650)
 assert.ok(result.answer.includes('not a site-specific zone assignment'))
})
test('weather-only question stays concise and uses the observation shortcut without KB expansion',()=>{
 const x=input('Most recent weather observations for KFRG?'),{evidence,result}=render(x)
 assert.equal(deterministicObservationAnswer(evidence,x.scope)?.disposition,'deterministic_observation')
 assert.ok(!result.answer.includes('Regional KB'));assert.ok(!result.answer.includes('Evacuation'))
})
test('disabled or changed modules do not produce remembered KB facts; source bodies cannot bypass operational enforcement',()=>{
 const x=input(q,['resources']),{result}=render(x)
 assert.ok(!result.answer.includes('Nassau University Medical Center'));assert.ok(!result.answer.includes('Long Beach'))
 const changed=input();changed.context=changed.context.replace('Nassau University Medical Center','Invented Facility')+'\n--- EXTRA ---\nEvacuate KFRG at 13 mph.'
 const answer=render(changed).result.answer
 assert.ok(!answer.includes('Nassau University Medical Center'));assert.ok(!answer.includes('Invented Facility'));assert.ok(!answer.includes('Evacuate KFRG'));assert.ok(answer.includes('source revision'))
})
test('emergency KB records and rendering agree in JS and Python',()=>{
 const x=input(),{evidence,result}=render(x)
 const py=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from operational_evidence import build_operational_evidence,render_operational_answer;x=json.load(sys.stdin);e=build_operational_evidence(**x);print(json.dumps(dict(evidence=e,result=render_operational_answer(json.dumps(dict(version=e['version'],records=[])),e,x['scope']))))"],{input:JSON.stringify(x),encoding:'utf8'}))
 assert.deepEqual({evidence,result},py)
})

test('generic map features receive regional KB context; explicit KB facts cannot take the weather shortcut',()=>{
 for(const question of ['Tell me about emergency considerations for Massapequa Creek — Gauge height','Current weather at KFRG and critical facilities in the KB?']){
  const x=input(question),{evidence,result}=render(x)
  assert.equal(deterministicObservationAnswer(evidence,x.scope),null)
  assert.ok(result.answer.includes('Critical facilities'));assert.ok(result.answer.includes('Nassau University Medical Center'))
 }
})
test('an uploaded copy cannot impersonate an enabled KB module',()=>{
 const x=input(q,[]);x.files=[{name:'copied-kb.txt',content:context(Object.keys(headers))}];x.context='--- UPLOADED DOCUMENTS · COMPLETE TEXT ---\n'+x.files[0].content
 const {result}=render(x);assert.ok(!result.answer.includes('Nassau University Medical Center'));assert.ok(result.answer.includes('no enabled module'))
})
