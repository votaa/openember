import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {documentEvidence,stripWeatherContext} from '../src/data/evidenceSummary.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {uploadedDocumentContext} from '../src/data/cloudUploads.js'
import {buildCopilotSystemPrompt} from '../src/data/copilotPrompt.js'
import handler from '../api/chat.js'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/scope/weather-selection.json',import.meta.url)))
const documents=[
 {name:'missing.txt',content:'Incident commander: not named\nCone ballast: unknown\nFacility coordinates: not provided\nRadio authority: unspecified'},
 {name:'supplied.md',content:'Incident commander: Casey Example\nCone specifications: 28 inch approved model\nCone ballast: 10 lb each\nCone placement: SOP section 4\nFacility coordinates: 40.8, -73.1\nRadio authority: Incident command approved for this event'},
 {name:'windows.txt',content:'Radio authority: dispatch approved\r\nCone placement: Appendix B\r\n'},
 {name:'conflict.txt',content:'Incident commander: Jordan Example'},
 {name:'uncertain.txt',content:'The officer in command is identified in the scanned appendix; extraction uncertain.'},
]
test('source-scoped document facts, conflicts, explicit gaps and extraction uncertainty agree in JS/Python',()=>{
 const rows=documentEvidence(documents)
 assert.equal(rows.find(r=>r.source==='missing.txt'&&r.field==='commander').status,'not provided')
 assert.equal(rows.find(r=>r.source==='supplied.md'&&r.field==='cone_ballast').status,'supplied')
 assert.equal(rows.find(r=>r.source==='supplied.md'&&r.field==='commander').status,'conflicting')
 assert.equal(rows.find(r=>r.source==='conflict.txt'&&r.field==='commander').status,'conflicting')
 assert.ok(rows.filter(r=>r.source==='uncertain.txt').every(r=>r.status==='unverified'))
 assert.deepEqual(rows,JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from evidence_summary import document_evidence;print(json.dumps(document_evidence(json.load(sys.stdin))))"],{input:JSON.stringify(documents),encoding:'utf8'})))
})
test('legacy live weather is removed while complete document text and unrelated alerts remain',()=>{
 const doc={name:'quoted.md',content:'Full source quote:\n--- NOAA DATA ---\n[NOAA: Quotation]\nSource: https://api.weather.gov/gridpoints/OKX/62,50/forecast\nQUOTED_WEATHER\nEnd of source'}
 const input=uploadedDocumentContext([doc])+'\n--- NOAA DATA ---\n[NOAA: Forecast]\nSource: https://api.weather.gov/gridpoints/OKX/62,50/forecast\nOUTSIDE_WEATHER\n[NOAA: Alerts]\nSource: https://api.weather.gov/alerts/active\nALERTS_RETAINED\nRULES: END'
 const cleaned=stripWeatherContext(input,[doc])
 assert.ok(cleaned.includes(doc.content));assert.ok(!cleaned.includes('OUTSIDE_WEATHER'));assert.ok(cleaned.includes('ALERTS_RETAINED'))
 assert.equal(cleaned,execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from evidence_summary import strip_weather_context;x=json.load(sys.stdin);print(strip_weather_context(x['context'],x['files']),end='')"],{input:JSON.stringify({context:input,files:[doc]}),encoding:'utf8'}))
})
test('actual Edge recording receives selected values without duplicate live weather, with complete uploads',async()=>{
 const c=fixture[1],OriginalDate=globalThis.Date,original=globalThis.fetch,calls=[]
 globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[c.requestedAt]))}static now(){return OriginalDate.parse(c.requestedAt)}}
 globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({message:{content:JSON.stringify({version:"operational-answer-v2",records:[]})},done:true})+"\n")}
 try {
  const context='FULL_KB\n'+uploadedDocumentContext(documents)+'\n--- NOAA DATA ---\n[NOAA: Point]\nSource: '+c.weather[0].url+'\nUNFILTERED_LATER_SENTINEL\n'
  const body={messages:[{role:'system',content:buildCopilotSystemPrompt('Long Island',context)},{role:'user',content:'tonight'}],uploads:documents,scope_input:{version:'request-scope-v1',weather:c.weather}}
  const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body)}))
  assert.equal(response.status,200);const wire=await response.text();assert.match(wire,/validated_envelope/);assert.equal(calls.length,1)
  const metadata=JSON.parse(wire.split('\n')[0]).ember_scope
  assert.equal(metadata.request_utc,c.requestedAt)
  const prompt=calls[0].messages[0].content
  assert.ok(!prompt.includes('UNFILTERED_LATER_SENTINEL'));assert.ok(!prompt.includes('"temperature":34'));assert.ok(!prompt.includes('"temperature":88'));assert.ok(prompt.includes('"temperature":36'))
  for(const file of documents)assert.ok(prompt.includes(file.content))
  assert.ok(prompt.includes('FULL_KB'));assert.ok(prompt.includes('SOURCE FACTS AND KNOWN GAPS'))
 }finally{globalThis.fetch=original;globalThis.Date=OriginalDate}
})

test('real React context assembly excludes ordinary weather summaries and preserves other live evidence',async()=>{
 const {summarizeWeather}=await import('../src/data/weatherContext.js')
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
 const code=app.slice(app.indexOf('function summarizeAPIData('),app.indexOf('async function* streamOllama('))
 const build=new Function('CFG','summarizeWeather','uploadedDocumentContext',code+';return buildContextRT')({state:'NY'},summarizeWeather,uploadedDocumentContext)
 const source=fixture[1].weather[0]
 const context=build(documents,[{success:true,type:'forecast',name:'point',url:source.url,data:source.data},{success:true,type:'flood',data:{value:{timeSeries:[{sourceInfo:{siteName:'GAUGE_SENTINEL'},values:[{value:[{value:'2'}]}]}]}}}],['module'],{module:{label:'KB',source:'fixture',data:'FULL_KB_SENTINEL'}},'Long Island')
 assert.ok(!context.includes('34°F'));assert.ok(!context.includes('88°F'));assert.ok(context.includes('GAUGE_SENTINEL'));assert.ok(context.includes('FULL_KB_SENTINEL'))
 for(const doc of documents)assert.ok(context.includes(doc.content))
})

test('weather navigation retains normalized source facts, units, freshness, coverage and limitations across runtimes',async()=>{
 const {weatherNavigation}=await import('../src/data/evidenceSummary.js')
 const {resolveRequestScope}=await import('../src/data/requestScope.js')
 const policy=JSON.parse(readFileSync(new URL('../shared/request-scope-policy.json',import.meta.url)))
 for(const c of [fixture[0],fixture[2],fixture[6],fixture[7]]) {
  const scope=resolveRequestScope({...c,policy})
  const python=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from evidence_summary import weather_navigation;x=json.load(sys.stdin);print(json.dumps(weather_navigation(x['weather'],x['scope'])))"],{input:JSON.stringify({weather:c.weather,scope}),encoding:'utf8'}))
  assert.deepEqual(weatherNavigation(c.weather,scope),python)
 }
})

test('cross-cutoff windows explicitly label near/later grid segments without rewriting original intervals',async()=>{
 const {resolveRequestScope,scopedWeather}=await import('../src/data/requestScope.js')
 const policy=JSON.parse(readFileSync(new URL('../shared/request-scope-policy.json',import.meta.url)))
 const c=fixture[2],scope=resolveRequestScope({...c,policy})
 assert.deepEqual(scope.segments.map(s=>s.evidence),['hourly_and_grid','point_periods_and_grid'])
 assert.equal(scope.segments[0].end_utc,'2026-11-15T15:00:00Z')
 assert.equal(scope.segments[1].start_utc,scope.segments[0].end_utc)
 const grid=scopedWeather(c.weather,scope).find(s=>s.id==='grid')
 assert.equal(grid.segments.length,2)
 assert.equal(grid.series.windGust.values[0].validTime,'2026-11-14T15:00:00Z/PT24H')
})
