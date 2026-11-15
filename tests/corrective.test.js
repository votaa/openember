import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coopsSnapshots,selectCoops} from '../src/data/coopsEvidence.js'
import {buildOperationalEvidence,renderOperationalAnswer} from '../src/data/operationalEvidence.js'
const f=JSON.parse(readFileSync(new URL('./fixtures/corrective/regressions.json',import.meta.url)))
const scope={status:'resolved',method:'source_period',timezone:'America/New_York',request_utc:f.request_utc,interval:f.interval}
const url='https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8518750&product=predictions&units=english&datum=MLLW&time_zone=lst_ldt&interval=hilo'
const raw={ep:{id:'coops_preds',url,name:'Battery'},ok:true,fetchedAt:f.request_utc,data:{predictions:[{t:'2026-11-14 04:41',v:'1.2',type:'L'},{t:'2026-11-14 17:41',v:'1.3',type:'L'},{t:'2026-11-14 18:00',v:'1.4',type:'L'},{t:'2026-11-15 06:00',v:'6',type:'H'}]}}
test('REG-TIDE-WINDOW: select instants, never use out-of-window extrema',()=>{
 const selected=selectCoops(coopsSnapshots([raw]),scope)
 assert.equal(selected[0].events.length,1)
 assert.equal(selected[0].events[0].time_utc,'2026-11-14T23:00:00Z')
 assert.equal(selected[0].facility_applicability,'unknown')
})
test('all historical failure transformations are contained across every output section',()=>{
 const evidence=buildOperationalEvidence({scope,files:[{name:'plan.txt',content:'Inventory: 47 amber cones\nIncident commander: not named\nRadio channel: DELTA-19'}],weather:[],coops:[],context:'',question:'tonight'})
 for(const c of f.cases)for(const section of ['facts','impacts','gaps','suggestions']) {
  const output=renderOperationalAnswer(JSON.stringify({version:'operational-answer-v1',[section]:[c.rejected]}),evidence,scope)
  assert.equal(output.disposition,'incomplete')
  assert.ok(!output.answer.includes(c.rejected),c.id+' '+section)
 }
})

import {execFileSync} from 'node:child_process'
import {stripWeatherContext} from '../src/data/evidenceSummary.js'
import handler from '../api/chat.js'
import {uploadedDocumentContext} from '../src/data/cloudUploads.js'
const positive={name:'positive-plan.md',content:readFileSync(new URL('./fixtures/corrective/positive-plan.md',import.meta.url),'utf8')}
const python=(input,code)=>JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');x=json.load(sys.stdin);"+code],{input:JSON.stringify(input),encoding:'utf8'}))
const envelope=JSON.stringify({version:'operational-answer-v1',references:[]})
test('supplied commander, deployed subset, threshold and authorized radio procedure survive',()=>{
 const evidence=buildOperationalEvidence({scope,files:[positive],question:'CEDAR-731 tonight'})
 const result=renderOperationalAnswer(envelope,evidence,scope)
 assert.equal(result.disposition,'validated_envelope')
 for(const text of ['Casey Example','12 amber cones deployed','remaining 35 in storage','10 ft','MLLW','8518750','Exercise command requires use DELTA-19'])assert.ok(result.answer.includes(text),text)
 assert.ok(evidence.facts.some(r=>r.kind==='threshold'));assert.ok(evidence.facts.some(r=>r.kind==='procedure'))
})
test('expired, mismatched target, altered sentence, wrong units and conflicting triggers are not promoted',()=>{
 for(const change of [s=>s.replaceAll('2026-11-15T11:00:00Z','2026-11-15T10:00:00Z'),s=>s.replace('Facility ID: CEDAR-731','Facility ID: ANOTHER'),s=>s.replace('water_level >= 10 ft; datum MLLW; station 8518750.\n','water_level >= 11 ft; datum MLLW; station 8518750.\n'),s=>s.replace('"unit":"ft"','"unit":"mph"')]) {
  const e=buildOperationalEvidence({scope,files:[{...positive,content:change(positive.content)}],question:'CEDAR-731 tonight'})
  assert.ok(!e.facts.some(r=>r.kind==='threshold'))
 }
 const conflict={name:'conflict.md',content:positive.content.replaceAll('10 ft','11 ft').replace('"value":10','"value":11')}
 const e=buildOperationalEvidence({scope,files:[positive,conflict],question:'CEDAR-731 tonight'})
 assert.ok(!e.facts.some(r=>r.kind==='threshold'));assert.ok(e.gaps.some(g=>g.includes('conflicting operational')))
})
test('null/stale/failed/ambiguous samples and exact end boundary cannot become future evidence',()=>{
 for(const changed of [{...raw,fetchedAt:'2026-11-14T18:00:00Z'},{...raw,ok:false},{...raw,data:{predictions:[null,{t:'2026-11-01 01:30',v:'2',type:'L'},{t:'2026-11-14 18:00',v:'',type:'H'}]}}])assert.equal(selectCoops(coopsSnapshots([changed]),scope)[0].events.length,0)
 const obs={...raw,ep:{...raw.ep,url:url.replace('product=predictions','product=water_level')},data:{metadata:{id:'8518750'},data:[{t:'2026-11-14 15:24',v:'2.2',q:'p',f:'0,0,0,0'}]}}
 const s=selectCoops(coopsSnapshots([obs]),scope)[0]
 assert.equal(s.events.length,0);assert.equal(s.background.length,1);assert.equal(s.background[0].time_utc,'2026-11-14T20:24:00Z')
 const flagged={...obs,data:{data:[{t:'2026-11-14 15:24',v:'2.2',q:'p',f:'0,1,0,0'}]}}
 assert.equal(selectCoops(coopsSnapshots([flagged]),scope)[0].background.length,0)
})
test('explicit station scope excludes unrelated reference stations without inventing facility linkage',()=>{
 const s=selectCoops(coopsSnapshots([raw]),scope,'Kings Point tonight')[0]
 assert.equal(s.state,'outside_requested_geography');assert.equal(s.events.length,0);assert.equal(s.background.length,0)
})
test('legacy CO-OPS summaries are stripped but complete document quotations survive',()=>{
 const doc={name:'quoted.txt',content:'[NOAA: quoted]\nSource: '+url+'\nDOCUMENT_TIDE'}
 const context=uploadedDocumentContext([doc])+'\n--- NOAA DATA ---\n[NOAA: Battery]\nSource: '+url+'\nOUTSIDE_TIDE\n[NOAA: unrelated]\nSource: https://example.invalid\nOTHER_DATA\n'
 const clean=stripWeatherContext(context,[doc]);assert.ok(!clean.includes('OUTSIDE_TIDE'));assert.ok(clean.includes(doc.content));assert.ok(clean.includes('OTHER_DATA'))
 assert.equal(clean,python({context,files:[doc]},"from evidence_summary import strip_weather_context;print(json.dumps(strip_weather_context(x['context'],x['files'])))"))
})
test('shared JS/Python selection, states, positive records and exact rendering agree',()=>{
 const coops=coopsSnapshots([raw]),input={scope,files:[positive],question:'CEDAR-731 tonight',coops,weather:[],context:'Fixture KB\n\nGeneral reference paragraph.'}
 assert.deepEqual(selectCoops(coops,scope),python(input,"from coops_evidence import select_coops;print(json.dumps(select_coops(x['coops'],x['scope'])))"))
 const evidence=buildOperationalEvidence(input)
 assert.deepEqual(evidence,python(input,"from operational_evidence import build_operational_evidence;print(json.dumps(build_operational_evidence(**x)))"))
 assert.deepEqual(renderOperationalAnswer(envelope,evidence,scope),python({evidence,scope,raw:envelope},"from operational_evidence import render_operational_answer;print(json.dumps(render_operational_answer(x['raw'],x['evidence'],x['scope'])))"))
})
test('invalid envelope, forged references, extra text and truncated responses fail closed',()=>{
 const e=buildOperationalEvidence({scope,files:[positive],question:'CEDAR-731 tonight'})
 for(const raw of ['not json','{"version":"operational-answer-v1"}',JSON.stringify({version:'operational-answer-v1',references:['FORGED']}),envelope+'\nAlert now',JSON.stringify({version:'operational-answer-v1',references:[],suggestions:['Alert now']})])assert.equal(renderOperationalAnswer(raw,e,scope).disposition,'incomplete')
 assert.equal(renderOperationalAnswer(envelope,e,scope,false).disposition,'incomplete')
})
test('actual Edge buffering never emits unvalidated prose; protected audit captures actual payload only in preview',async()=>{
 const original=globalThis.fetch,oldEnv=process.env.VERCEL_ENV,oldToken=process.env.EMBER_PREVIEW_AUDIT_TOKEN,calls=[]
 process.env.VERCEL_ENV='preview';process.env.EMBER_PREVIEW_AUDIT_TOKEN='test-session-token'
 globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({model:'fixture-model',thinking:'PRIVATE_THINKING',message:{content:'Alert if water rises > 1 ft above the low-tide mark.'},done:true})+'\n')}
 try {
  const body={messages:[{role:'system',content:uploadedDocumentContext([positive])},{role:'user',content:'CEDAR-731 tonight'}],uploads:[positive]}
  for(const auditing of [false,true]) {
   const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only',...(auditing?{'x-ember-audit-token':'test-session-token'}:{})},body:JSON.stringify(body)}))
   assert.equal(response.status,200)
   const wire=await response.text(),frames=wire.trim().split('\n').map(JSON.parse),visible=frames.map(f=>f.message?.content||'').join('')
   assert.ok(!visible.includes('Alert if water rises > 1 ft'));assert.ok(visible.includes('Incomplete answer'));assert.ok(!wire.includes('PRIVATE_THINKING'))
   assert.equal(frames.some(f=>f.ember_audit),auditing)
   if(auditing)assert.deepEqual(frames.find(f=>f.ember_audit).ember_audit.payload,calls.at(-1))
   assert.equal(calls.at(-1).format,undefined);assert.ok(calls.at(-1).messages[0].content.includes('CONTROLLED OUTPUT CONTRACT:'))
  }
 }finally {globalThis.fetch=original;if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;if(oldToken===undefined)delete process.env.EMBER_PREVIEW_AUDIT_TOKEN;else process.env.EMBER_PREVIEW_AUDIT_TOKEN=oldToken}
})

test('supported gauge linkage is retained while unlinked and conflicting linkages stay unknown',()=>{
 const statement='CEDAR-731: water-level gauge linkage station 8518750; basis exercise-approved mapping.'
 const record={kind:'gauge_linkage',target:'CEDAR-731',authority:'Exercise command',source_url:'https://example.invalid/mapping',valid_start:f.interval.start_utc,valid_end:f.interval.end_utc,station_id:'8518750',basis:'exercise-approved mapping',statement}
 const linked={name:'link.md',content:'Facility ID: CEDAR-731\n'+statement+'\n```operational-evidence-v1\n'+JSON.stringify(record)+'\n```'}
 const requestScope=structuredClone(scope),evidence=buildOperationalEvidence({scope:requestScope,files:[linked],coops:coopsSnapshots([raw]),question:'CEDAR-731 tonight'})
 assert.ok(evidence.facts.some(r=>r.kind==='coops'&&r.text.includes('documents linkage to CEDAR-731')))
 assert.deepEqual(evidence,python({scope:structuredClone(scope),files:[linked],coops:coopsSnapshots([raw]),question:'CEDAR-731 tonight'},"from operational_evidence import build_operational_evidence;print(json.dumps(build_operational_evidence(**x)))"))
 const conflict={name:'other-link.md',content:linked.content.replaceAll('8518750','8516945')}
 const conflictingScope=structuredClone(scope)
 buildOperationalEvidence({scope:conflictingScope,files:[linked,conflict],question:'CEDAR-731 tonight'})
 assert.equal(conflictingScope.facility_linkages.length,0)
})

test('malformed and interrupted actual Edge output cannot return a successful envelope',async()=>{
 const original=globalThis.fetch
 try {
  for(const frames of [[{message:{content:envelope}}],[{message:{content:envelope},done:true,done_reason:'length'}],[{message:{content:envelope},done:true,done_reason:'error'}]]) {
   globalThis.fetch=async()=>new Response(frames.map(JSON.stringify).join('\n')+'\n')
   const body={messages:[{role:'system',content:'Fixture KB'},{role:'user',content:'Current conditions?'}]}
   const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body)}))
   const wire=await response.text();assert.ok(wire.includes('Incomplete answer'));assert.ok(!wire.includes('validated_envelope'))
  }
 }finally{globalThis.fetch=original}
})

test('unresolved scope prompts clarification and planning assumptions remain explicit',()=>{
 const evidence=buildOperationalEvidence({scope,files:[],question:'next operational period'})
 const clarified={...scope,clarification:'Which approved incident period applies?',assumptions:['Application planning fallback, not a command-approved schedule.']}
 const output=renderOperationalAnswer(envelope,evidence,clarified)
 assert.ok(output.answer.includes('Clarification needed: Which approved incident period applies?'))
 assert.ok(output.answer.includes('Application planning fallback, not a command-approved schedule.'))
 assert.deepEqual(output,python({scope:clarified,evidence,raw:envelope},"from operational_evidence import render_operational_answer;print(json.dumps(render_operational_answer(x['raw'],x['evidence'],x['scope'])))"))
})
