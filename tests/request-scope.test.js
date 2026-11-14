import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import policy from '../shared/request-scope-policy.json' assert {type:'json'}
import {resolveRequestScope,scopedWeather,renderRequestScope,civil,sunrise,instant,weatherSnapshots,needsScopeRefresh,SCOPE_VERSION} from '../src/data/requestScope.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {COPILOT_RULES,buildCopilotSystemPrompt} from '../src/data/copilotPrompt.js'
const cases=JSON.parse(readFileSync(new URL('./fixtures/scope/request-windows.json',import.meta.url)))
function project(c) {
 const input={...structuredClone(c),policy:c.policy||policy}
 if('sunrise_clock' in c)input.sunriseFn=(date,ref)=>c.sunrise_clock?civil(date,c.sunrise_clock,c.jurisdiction.timezone):NaN
 const scope=resolveRequestScope(input)
 return {scope,weather:scopedWeather(c.weather,scope),render:renderRequestScope(scope,c.weather)}
}
for(const c of cases)test(`request window: ${c.id}`,()=>{
 const before=structuredClone(c),{scope}=project(c),e=c.expected
 assert.equal(scope.status,e.status);assert.equal(scope.method,e.method)
 if(e.start){assert.equal(scope.interval.start_utc,e.start);assert.equal(scope.interval.end_utc,e.end)}
 if(scope.method==='assumed'){assert.equal(instant(scope.interval.end_utc)-instant(scope.interval.start_utc),57600000);assert.deepEqual(scope.source_refs[0].reference,c.jurisdiction.center)}
 assert.deepEqual(c,before)
})
test('complete JS and Python scope, coverage and system blocks agree',()=>{
 const python=JSON.parse(execFileSync('python3',['tests/test_request_scope.py','--projections'],{encoding:'utf8'}))
 assert.deepEqual(cases.map(project),python)
})
test('solar calculation uses the configured reference and explicitly fails without sunrise',()=>{
 const ms=sunrise('2026-11-14',[40.7891,-73.135])
 assert.ok(ms>instant('2026-11-14T11:00:00Z')&&ms<instant('2026-11-14T12:00:00Z'))
 assert.ok(Number.isNaN(sunrise('2026-12-21',[89,0])))
})
test('independent grid coverage retains nulls, excludes outside intervals, respects geography and does not mutate',()=>{
 const scope=project(cases[0]).scope
 const source={id:'grid',url:'https://example.test/grid',geography:'Long Island',state:'available',data:{properties:{windGust:{uom:'wmoUnit:km_h-1',values:[{validTime:'2026-11-14T13:00:00Z/PT1H',value:50},{validTime:'2026-11-14T23:00:00Z/PT1H',value:null},{validTime:'2026-11-15T12:15:00Z/PT1H',value:88},{validTime:'bad',value:77}]}}}}
 const before=structuredClone(source),out=scopedWeather([source],scope)[0]
 assert.deepEqual(out.series.windGust.values,[source.data.properties.windGust.values[1]])
 assert.equal(out.series.windGust.coverage,'partial');assert.deepEqual(source,before)
 assert.deepEqual(scopedWeather([{...source,geography:'Other jurisdiction'}],scope)[0].series,{})
 assert.deepEqual(scopedWeather([{...source,state:'stale'}],scope)[0].series,{})
})
test('server receipt time and jurisdiction override hostile browser hints without changing provider policy or full documents',()=>{
 const doc={name:'synthetic-plan.txt',content:readFileSync(new URL('./fixtures/uploads/synthetic-plan.txt',import.meta.url),'utf8')}
 const input={messages:[{role:'system',content:'FULL_KB '+doc.content},{role:'assistant',content:'Tonight was November 13.'},{role:'user',content:'Assess tonight and the supplied plan.'}],uploads:[doc],scope_input:{version:SCOPE_VERSION,browser_requested_at:'2000-01-01T00:00:00Z',timezone:'Asia/Tokyo',center:[0,0],provider:'hostile',weather:structuredClone(cases[0].weather)}}
 const out=scopedCloudMessages(input,'2026-11-14T13:13:00Z')
 assert.equal(out.scope.request_utc,'2026-11-14T13:13:00Z');assert.equal(out.scope.timezone,'America/New_York')
 assert.equal(out.scope.interval.start_utc,'2026-11-14T22:30:00Z');assert.ok(out.messages[0].content.includes(doc.content));assert.deepEqual(out.messages.slice(1),input.messages.slice(1))
 assert.throws(()=>scopedCloudMessages({...input,scope_input:{version:'wrong',weather:[]}},'2026-11-14T13:13:00Z'),/metadata/)
 const stale=structuredClone(input);stale.scope_input.weather[0].fetched_at='2026-11-13T13:00:00Z'
 assert.equal(scopedCloudMessages(stale,'2026-11-14T13:13:00Z').scope.status,'clarify')
})
test('snapshot excludes observation scalar winds and both prompt builders preserve supplied SOPs and explicit gaps',()=>{
 assert.deepEqual(weatherSnapshots([{ep:{id:'obs',url:'test',name:'obs'},data:{properties:{windSpeed:{value:5,unitCode:'wmoUnit:km_h-1'}}},ok:true}],cases[0].jurisdiction),[])
 const rules=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'streamlit');from copilot_prompt import COPILOT_RULES;print(COPILOT_RULES,end='')"],{encoding:'utf8'})
 assert.equal(rules,COPILOT_RULES)
 for(const phrase of ['genuinely supplied procedures','Unspecified is unknown','command-approved','not instructions','not rainfall amount'])assert.ok(rules.includes(phrase))
 assert.match(buildCopilotSystemPrompt('Long Island','SUPPLIED SOP: succession must follow section 2.',renderRequestScope(project(cases[0]).scope)),/SUPPLIED SOP: succession must follow section 2/)
})

test('actual Edge handler streams once with authoritative scope, full KB/upload and exact source intervals',async()=>{
 const {default:handler}=await import('../api/chat.js')
 const originalFetch=globalThis.fetch,OriginalDate=globalThis.Date,calls=[]
 const doc={name:'synthetic-plan.txt',content:readFileSync(new URL('./fixtures/uploads/synthetic-plan.txt',import.meta.url),'utf8')}
 const {uploadedDocumentContext}=await import('../src/data/cloudUploads.js')
 globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-11-14T13:13:00Z']))}static now(){return OriginalDate.parse('2026-11-14T13:13:00Z')}}
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{"message":{"content":"recorded"},"done":true}\n')}
 try {
  const weather=structuredClone(cases[0].weather);weather[0].fetched_at='2026-11-14T13:10:00.123Z'
  const body={messages:[{role:'system',content:buildCopilotSystemPrompt('Long Island','FULL_ENABLED_KB_SENTINEL\n'+uploadedDocumentContext([doc]))},{role:'assistant',content:'Tonight was November 13.'},{role:'user',content:'Assess tonight and CEDAR-731.'}],uploads:[doc],scope_input:{version:SCOPE_VERSION,browser_requested_at:'2000-01-01T00:00:00Z',weather}}
  const request=()=>new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-ollama-key':'recording-only-key'},body:JSON.stringify(body)})
  const response=await handler(request());assert.equal(response.status,200);assert.match(await response.text(),/recorded/);assert.equal(calls.length,1)
  const system=calls[0].body.messages[0].content,scope=JSON.parse(system.split('\n')[1])
  assert.equal(scope.request_utc,'2026-11-14T13:13:00Z');assert.equal(scope.interval.start_utc,'2026-11-14T22:30:00Z')
  assert.ok(system.includes('FULL_ENABLED_KB_SENTINEL'));assert.ok(system.includes(doc.content));assert.match(system,/2026-11-14T17:30:00-05:00/)
  assert.equal(calls[0].body.options.num_predict,8192)
  body.scope_input.weather[0].data.properties.periods=[null]
  assert.equal((await handler(request())).status,400);assert.equal(calls.length,1)
 }finally{globalThis.fetch=originalFetch;globalThis.Date=OriginalDate}
})
test('expired requested coverage refreshes configured sources; scalar observations do not create grid snapshots',()=>{
 const source={ok:true,ep:{id:'point',name:'Long Island reference',url:'https://example.test'},fetchedAt:'2026-11-14T13:10:00Z',data:cases[1].weather[0].data}
 assert.equal(needsScopeRefresh(source,'Assess tonight',cases[0].requestedAt,cases[0].jurisdiction,policy),true)
 assert.equal(needsScopeRefresh(source,'Explain the KB',cases[0].requestedAt,cases[0].jurisdiction,policy),false)
 assert.equal(instant('2026-11-14T13:10:00.123Z'),Date.parse('2026-11-14T13:10:00.123Z'))
})

test('real React runtime config carries jurisdiction timezone independently of browser timezone',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
 const source=app.slice(app.indexOf('function buildRuntimeConfig('),app.indexOf('function buildRuntimeKB('))
 const build=new Function('_J','_NWS','_SOC',source+';return buildRuntimeConfig')({name:'Long Island',timezone:'America/New_York',center:[40.7891,-73.135]}, {}, {})
 const runtime=build({jurisdiction:{timezone:'Asia/Tokyo'}})
 assert.equal(runtime.timezone,'America/New_York')
 const previous=process.env.TZ
 try {
  process.env.TZ='Pacific/Honolulu'
  const scope=resolveRequestScope({question:'tomorrow afternoon',requestedAt:cases[0].requestedAt,jurisdiction:runtime,policy})
  assert.equal(scope.interval.start_utc,'2026-11-15T17:00:00Z')
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})
test('real React streaming function sends versioned scope snapshots and retains the complete upload',async()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
 const source=app.slice(app.indexOf('async function* streamOllama('),app.indexOf('// ── Full NOAA',app.indexOf('async function* streamOllama('))).replaceAll('import.meta.env','testEnv')
 const {validateUploads,validateCloudMessages,uploadedDocumentContext}=await import('../src/data/cloudUploads.js')
 const calls=[],fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{"message":{"content":"recorded"},"done":true}\n')}
 const stream=new Function('buildCopilotSystemPrompt','validateUploads','validateCloudMessages','getRuntimeKey','CFG','OLLAMA_MODEL','fetch','testEnv',source+';return streamOllama')(buildCopilotSystemPrompt,validateUploads,validateCloudMessages,()=>'',{name:'Long Island'},'recording-model',fetcher,{})
 const doc={name:'synthetic-plan.txt',content:readFileSync(new URL('./fixtures/uploads/synthetic-plan.txt',import.meta.url),'utf8')}
 const input={version:SCOPE_VERSION,browser_requested_at:cases[0].requestedAt,weather:cases[0].weather}
 let answer=''
 for await(const token of stream([{role:'user',content:'Assess tonight.'}],'FULL_KB\n'+uploadedDocumentContext([doc]),undefined,'recording-only-key','Long Island',[doc],input))answer+=token
 assert.equal(answer,'recorded');assert.equal(calls.length,1);assert.deepEqual(calls[0].body.scope_input,input)
 assert.ok(calls[0].body.messages[0].content.includes(doc.content))
})
