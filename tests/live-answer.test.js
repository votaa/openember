import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolveRequestScope,renderRequestScope} from '../src/data/requestScope.js'
import {buildLiveAnswer,liveAnswerInstruction,renderLiveAnswer,recordAnswerResult} from '../src/data/liveAnswer.js'
import {SYNTHESIS_VERSION} from '../src/data/locationSynthesis.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import {uploadedDocumentContext} from '../src/data/cloudUploads.js'
const cases=JSON.parse(readFileSync(new URL('./fixtures/locations/source-adapters.json',import.meta.url)))
const project=x=>{const scope=resolveRequestScope(x),evidence=buildLiveAnswer({...x,scope}),proposal={version:evidence.version,statements:evidence.synthesis.candidates.filter(c=>c.proposal.category==='conditional_consideration').map(c=>c.proposal).slice(0,32)},result=renderLiveAnswer(JSON.stringify(proposal),evidence,scope);recordAnswerResult(scope,result,{completion_reason:'stop',provider_called:true});return {scope,instruction:liveAnswerInstruction(evidence),result,prompt_scope:{scope:JSON.parse(renderRequestScope(scope,x.weather).split('\n')[1]),weather:JSON.parse(renderRequestScope(scope,x.weather).split('\n')[3])}}}
test('selected map assessments enter synthesis; ordinary, weather and changed-location questions keep the bounded route',()=>{
 for(const x of cases)assert.equal(buildLiveAnswer({...x,scope:resolveRequestScope(x)}).route,'location_synthesis')
 for(const question of ['Most recent weather observations for KFRG?','CEDAR-731 threshold and authorized radio procedure tonight']) {
  const x={...cases[0],question},e=buildLiveAnswer({...x,scope:resolveRequestScope(x)})
  assert.equal(e.route,'bounded_query_records');assert.equal(e.synthesis,undefined)
 }
})
test('complete live route, retained registry, validation, instruction and model-facing scope agree in JS/Python',()=>{
 const py=JSON.parse(execFileSync('python3',['tests/test_live_answer.py','--project'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:24*1024*1024}))
 assert.deepEqual(cases.map(project),py)
})
test('prompts retain full enabled sources and uploads with a compact scope and conditional-only registry',()=>{
 for(const x of cases.slice(0,2)) {
  const body={messages:[{role:'system',content:x.context},{role:'user',content:x.question}],uploads:x.files,scope_input:{version:'request-scope-v1',weather:x.weather,selected_location:x.selectedLocation}}
  const prepared=scopedCloudMessages(body,x.requestedAt,x.localJurisdiction),prompt=prepared.messages[0].content
  assert.ok(prompt.includes(x.context));assert.ok(prompt.includes('SYNTHESIS CHECKPOINT CONTRACT'))
  const registry=JSON.parse(prompt.split('Registry: ').at(-1).split(' All supported facts and material gaps render independently.')[0])
  assert.ok(registry.every(c=>c.category==='conditional_consideration'))
  assert.ok(!renderRequestScope(prepared.scope,x.weather).includes('"candidates":'))
  assert.ok(Buffer.byteLength(prompt)+Buffer.byteLength(x.question)<=98304)
 }
})
test('actual Edge buffering emits validated synthesis and persistent scope for valid, unsupported, truncated and malformed outputs',async()=>{
 const {default:handler}=await import('../api/chat.js'),fetchBefore=globalThis.fetch,DateBefore=globalThis.Date
 const x=cases[0];globalThis.Date=class extends DateBefore{constructor(...args){super(...(args.length?args:[x.requestedAt]))}static now(){return DateBefore.parse(x.requestedAt)}}
 const inputs=[],runs=[]
 try {
  for(const mode of ['valid','unsupported','length','missing_terminal','malformed','http_error','connection_error']) {
   globalThis.fetch=async(url,options)=>{
    if(String(url).includes('FeatureServer')) {
     const layer=String(url).split('/').at(-2);return new Response(readFileSync(new URL(`./fixtures/jurisdiction/kfrg-${layer}.json`,import.meta.url),'utf8'))
    }
    const payload=JSON.parse(options.body);inputs.push(payload)
    if(mode==='http_error')return new Response('untrusted provider error',{status:503})
    if(mode==='connection_error')throw Error('connection refused')
    const registry=JSON.parse(payload.messages[0].content.split('Registry: ').at(-1).split(' All supported facts and material gaps render independently.')[0])
    let content=JSON.stringify({version:SYNTHESIS_VERSION,statements:registry})
    if(mode==='unsupported')content=JSON.stringify({version:SYNTHESIS_VERSION,statements:[{...registry[0],interpretation:'runway_open'}]})
    if(mode==='malformed')return new Response('bad stream\n')
    const frames=[{message:{content:content.slice(0,20)}},{message:{content:content.slice(20)},...(mode==='missing_terminal'?{}:{done:true,done_reason:mode==='length'?'length':'stop'})}]
    return new Response(frames.map(f=>JSON.stringify(f)+'\n').join(''))
   }
   const body={messages:[{role:'system',content:x.context},{role:'user',content:x.question}],scope_input:{version:'request-scope-v1',weather:x.weather,selected_location:x.selectedLocation}}
   const res=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body)}))
   assert.equal(res.status,200)
   const frames=(await res.text()).trim().split('\n').map(JSON.parse),visible=frames.map(f=>f.message?.content||'').join(''),scope=frames.filter(f=>f.ember_scope).at(-1).ember_scope
   assert.match(visible,/4030 seconds old/);assert.match(visible,/631-852-4900/);assert.doesNotMatch(visible,/runway_open|"statements"|mandatory evacuation ANY/)
   assert.equal(frames.filter(f=>f.message?.content).length,1)
   assert.equal(scope.enforcement.route,'location_synthesis');assert.equal(scope.synthesis.validation.operational_verification,'not_established')
   assert.equal(scope.synthesis.validation.response_completeness,mode==='valid'?'bounded_synthesis':'supported_fallback')
   const history=JSON.parse(JSON.stringify({role:'assistant',content:visible,scope,sourceMaterial:x.context}))
   assert.equal(history.scope.enforcement.validation.format,scope.synthesis.validation.format);assert.equal(history.sourceMaterial,x.context)
   runs.push({mode,answer:visible,scope})
  }
  assert.equal(inputs.length,7)
  if(process.env.LIVE_SYNTHESIS_CAPTURE_DIR)writeFileSync(process.env.LIVE_SYNTHESIS_CAPTURE_DIR+'/edge-runs.json',JSON.stringify({kind:'Actual Edge handler with recording provider; no cloud generations',inputs,runs},null,2)+'\n')
 }finally{globalThis.fetch=fetchBefore;globalThis.Date=DateBefore}
})

if(process.env.LIVE_SYNTHESIS_CAPTURE_DIR) {mkdirSync(process.env.LIVE_SYNTHESIS_CAPTURE_DIR,{recursive:true});writeFileSync(process.env.LIVE_SYNTHESIS_CAPTURE_DIR+'/fixture-results.json',JSON.stringify(cases.map(x=>({input:x,...project(x)})),null,2)+'\n')}
