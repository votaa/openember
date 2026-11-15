import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolveRequestScope,scopedWeather} from '../src/data/requestScope.js'
import {buildOperationalEvidence,renderOperationalAnswer} from '../src/data/operationalEvidence.js'
import {forecastRelationship} from '../src/data/evidenceLocation.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
const cases=JSON.parse(readFileSync(new URL('./fixtures/locations/evidence-bundle.json',import.meta.url)))
function project(x) {const scope=resolveRequestScope(x),evidence=buildOperationalEvidence({...x,scope});return {scope,weather:scopedWeather(x.weather,scope),evidence,answer:renderOperationalAnswer(JSON.stringify({version:evidence.version,records:[]}),evidence,scope)}}
const get=name=>project(cases.find(x=>x.name===name))
test('67m10s KFRG reading survives as latest reported, with values, units, quality and separate source age',()=>{
 const {weather,answer,scope}=get('kfrg-67-minutes'),s=weather[0]
 assert.equal(s.latest_reported.age_seconds,4030);assert.equal(s.latest_reported.source_age_seconds,0);assert.equal(s.latest_reported.current_eligible,false)
 assert.equal(s.latest_reported.fields.windGust.value,33.336);assert.equal(s.latest_reported.fields.windGust.qualityControl,'S');assert.deepEqual(s.observation.fields,{})
 assert.match(answer.answer,/Latest reported; outside the current freshness window \(4030 seconds old\)/)
 assert.ok(scope.evidence_bundle.claims.every(c=>scope.evidence_bundle.sources.some(s=>s.id===c.source_id)))
})
test('age, cache age, identity, coordinates, failure and missing fields remain distinct; old snapshots never supply values',()=>{
 for(const name of ['too-old','old-cache','invalid-time','future-time','wrong-identity','wrong-coordinates','failed','missing-values','missing-cache','stale-cache','future-cache','malformed-field','missing-coordinates']) {
  const out=get(name),s=out.weather[0];assert.equal(s.latest_reported,undefined,name);assert.deepEqual(s.observation?.fields||{},{},name)
  assert.ok(!out.scope.evidence_bundle.claims.some(c=>c.payload?.fields?.windSpeed),name)
 }
 assert.equal(get('too-old').weather[0].background_disposition,'outside_background_retention')
 assert.equal(get('invalid-time').weather[0].state,'invalid_observation_time')
})
test('nearby references follow full geometry vertices; named stations never substitute',()=>{
 const hospital=get('hospital'),road=get('road'),missing=get('named-missing')
 assert.deepEqual(hospital.scope.observation_selection.stations,['KFRG'])
 assert.ok(road.scope.observation_selection.stations.length>1)
 assert.match(road.answer.answer,/coverage between vertices/)
 assert.ok(!missing.weather.some(s=>Object.keys(s.observation?.fields||{}).length||s.latest_reported))
 assert.ok(!get('no-geometry').weather.some(s=>Object.keys(s.observation?.fields||{}).length||s.latest_reported))
})
test('site forecast requires footprint containment and time eligibility; point/regional labels cannot substitute',()=>{
 assert.equal(get('forecast-inside').weather.at(-1).periods.length,1)
 for(const name of ['forecast-outside','forecast-point','forecast-crossing','forecast-hole','forecast-concave','forecast-self-crossing'])assert.equal(get(name).weather.at(-1).periods.length,0,name)
 const future=get('forecast-inside').weather.at(-1);assert.equal(future.location_relationship.status,'contained');assert.equal(future.granularity,'hourly')
})
test('bundle retains full upload and enabled context references without treating source text as site facts',()=>{
 const input=cases[0],out=get(input.name),bundle=out.scope.evidence_bundle
 assert.ok(bundle.sources.some(s=>s.kind==='upload'&&s.raw.index===0))
 const context=bundle.sources.filter(s=>s.kind==='enabled_context');assert.ok(context.length>=3)
 assert.ok(context.every(s=>s.location.status==='unresolved'&&input.context.slice(s.raw.start,s.raw.end)))
 assert.ok(bundle.gaps.some(g=>g.reason.includes('no outage')))
 const body={messages:[{role:'system',content:input.context},{role:'user',content:input.question}],uploads:[],scope_input:{version:'request-scope-v1',weather:input.weather,selected_location:input.selectedLocation}}
 const cloud=scopedCloudMessages(body,input.requestedAt);assert.equal(cloud.scope.evidence_bundle.claims[0].time.disposition,'latest_reported')
 assert.ok(cloud.messages[0].content.includes(input.context));assert.match(cloud.messages[0].content,/latest_reported/)
})
test('complete JS/Python bundle, answer, selection and failure projections agree',()=>{
 const python=JSON.parse(execFileSync('python3',['tests/test_location_evidence_bundle.py','--project'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:12*1024*1024}))
 assert.deepEqual(cases.map(project),python)
})

test('current and background age boundaries remain separate and inclusive',()=>{
 assert.ok(Object.keys(get('current-boundary').weather[0].observation.fields).length)
 assert.equal(get('current-boundary').weather[0].latest_reported,undefined)
 assert.equal(get('just-aged').weather[0].latest_reported.age_seconds,3601)
 assert.equal(get('retention-boundary').weather[0].latest_reported.age_seconds,86400)
 assert.equal(get('past-retention').weather[0].latest_reported,undefined)
})

test('actual Edge stream retains latest report and bundle metadata through the controlled provider route',async()=>{
 const {default:handler}=await import('../api/chat.js'),input=cases[0],originalFetch=globalThis.fetch,OriginalDate=globalThis.Date,calls=[]
 globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[input.requestedAt]))}static now(){return OriginalDate.parse(input.requestedAt)}}
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url))
  if(String(url).includes('FeatureServer'))return new Response(JSON.stringify({features:[]}))
  return new Response(JSON.stringify({message:{content:JSON.stringify({version:'operational-answer-v2',records:[]})},done:true})+'\n')
 }
 try {
  const body={messages:[{role:'system',content:input.context},{role:'user',content:input.question}],scope_input:{version:'request-scope-v1',weather:input.weather,selected_location:input.selectedLocation}}
  const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body)}))
  assert.equal(response.status,200);const text=await response.text()
  assert.match(text,/location-evidence-bundle-v1/);assert.match(text,/4030 seconds old/);assert.match(text,/outside the current freshness window/)
  assert.equal(calls.filter(url=>!url.includes('FeatureServer')).length,1)
 }finally{globalThis.fetch=originalFetch;globalThis.Date=OriginalDate}
})
