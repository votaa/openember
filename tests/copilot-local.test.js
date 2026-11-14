import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createChatHandler} from '../lib/chat-handler.js'
import {createCopilot,synthesisMessages} from '../lib/copilot-service.js'
import {COPILOT_RULES} from '../src/data/copilotPrompt.js'
import {localAnswer} from '../lib/copilot-local-queries.js'
import {planRequest} from '../lib/copilot-intent.js'
import {adaptEvidence} from '../lib/copilot-evidence.js'
import {streamChat,getCopilotCapabilities} from '../src/ollama-client.js'
import {makeCopilotRequest,withLegacyContext} from '../src/data/copilotSnapshot.js'
const corpus=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/conformance.json',import.meta.url)))
const fixture=id=>corpus.adapters.find(f=>f.id===id)
const requestFor=c=>({...structuredClone(corpus.base_request),...structuredClone(c.request),evidence:c.evidence_ids.map(id=>structuredClone(fixture(id).expected))})
const direct=corpus.planning_cases.filter(c=>c.expected.outcome!=='synthesis')
const noProvider=()=>{throw Error('no discovery, model request or cloud fallback permitted')}
const handler=(fetcher=noProvider,env={OLLAMA_MODE:'local-only'})=>createChatHandler({env,fetcher,copilot:createCopilot({COPILOT_EXECUTION_MODE:'hybrid'},{clock:()=>Date.parse(corpus.base_request.requested_at)})})
const post=(handle,request,query='')=>handle(new Request('http://localhost/api/chat'+query,{method:'POST',body:JSON.stringify({request})}))
const frames=async response=>(await response.text()).trim().split('\n').map(JSON.parse)
for (const c of direct) test(`local service bypasses all providers: ${c.id}`,async()=>{
  const request=requestFor(c), result=await frames(await post(handler(),request))
  assert.equal(result.filter(f=>f.done).length,1)
  assert.equal(result[0].response.execution_mode,'local_query')
  assert.equal(result[0].response.provider,null)
  assert.ok(result.every(f=>!f.provider&&!f.load_duration&&!f.message?.thinking))
  const expected=localAnswer(request,planRequest(request))
  assert.equal(result.at(-1).message.content,expected.answer)
})
test('local facts preserve full wind, zero categories, complete counts and citations',async()=>{
  const answer=async id=>(await frames(await post(handler(),requestFor(corpus.planning_cases.find(c=>c.id===id))))).at(-1).message.content
  assert.match(await answer('forecast-low-wind'),/Low: 44°F; Wind: 7 to 10 mph W/)
  assert.match(await answer('forecast-low-wind'),/https:\/\/api.weather.gov\/gridpoints\/OKX\/62,50\/forecast/)
  assert.match(await answer('map'),/900 features/)
  assert.doesNotMatch(await answer('map'),/500 features/)
  assert.match(await answer('reports'),/Direct electrical reports: 0/)
  assert.match(await answer('reports'),/not utility-confirmed outages/)
  assert.match(await answer('dst-offsets-preserved'),/-04:00.*—.*-05:00/)
})
test('capabilities and planning do not require even valid provider configuration',async()=>{
  const handle=handler(noProvider,{OLLAMA_MODE:'invalid'})
  assert.deepEqual(await getCopilotCapabilities({fetcher:(url,opts)=>handle(new Request('http://localhost'+url,opts))}),{execution_mode:'hybrid',request_versions:['1.0'],legacy_messages:true,context_versions:['1.0'],provider_policy:'local-first'})
  assert.equal((await post(handle,requestFor(direct[0]),'?plan')).status,200)
})
test('browser consumes response metadata and one completion without fake model status',async()=>{
  const handle=handler();let metadata,providerCalls=0,answer=''
  for await(const token of streamChat([], {structuredRequest:requestFor(direct[0]),fetcher:(url,opts)=>handle(new Request('http://localhost'+url,opts)),onResponse:r=>metadata=r,onProvider:()=>providerCalls++})) answer+=token
  assert.equal(providerCalls,0);assert.equal(metadata.execution_mode,'local_query');assert.match(answer,/44°F/)
})
test('synthesis uses full legacy messages for every provider attempt and preserves mixed question',async()=>{
  const q='Explain tonight’s weather and compare it with my uploaded plan.'
  const base={...corpus.base_request,question:q}
  const request=withLegacyContext(base,'FULL KB '+ 'retained '.repeat(8000)+'LATE-KB-FACT',adaptEvidence)
  const calls=[]
  const fetcher=async(url,opts)=>{calls.push({url,opts});return url.endsWith('/api/tags')?Response.json({models:[]}):new Response('{"message":{"content":"Grounded"},"done":true}\n')}
  const result=await frames(await post(handler(fetcher,{OLLAMA_MODE:'local-first',OLLAMA_API_KEY:'fixture-key'}),request))
  assert.equal(calls.filter(c=>c.url.endsWith('/api/chat')).length,1)
  const messages=JSON.parse(calls.at(-1).opts.body).messages
  assert.deepEqual(messages,synthesisMessages(request));assert.match(messages[0].content,/LATE-KB-FACT/)
  assert.equal(messages.at(-1).content,q)
  assert.equal(result[0].response.execution_mode,'llm_grounded');assert.equal(result[0].response.provider,'cloud')
})
test('structured validation and size limits fail before any provider request',async()=>{
  const handle=handler()
  assert.equal((await post(handle,{...corpus.base_request,provider:'cloud'})).status,400)
  assert.equal((await handle(new Request('http://localhost/api/chat',{method:'POST',body:' '.repeat(8*1024*1024+1)}))).status,413)
  const legacy=createChatHandler({fetcher:noProvider})
  assert.equal((await post(legacy,corpus.base_request)).status,400)
})
test('UI snapshots mark unqueried map layers for scoped acquisition and retain full uploads in synthesis context',()=>{
  const req=makeCopilotRequest({question:'Count features in Fire/EMS',name:'Long Island',layers:[{id:'fire',name:'Fire/EMS',url:'https://example.test/FeatureServer/2',fetchedAt:new Date().toISOString()}]},adaptEvidence)
  assert.equal(planRequest(req).operations[0].status,'acquire')
})
test('local results and metadata agree with Python',()=>{
  const requests=direct.map(requestFor)
  const python=JSON.parse(execFileSync('python3',['tests/test_copilot_local.py','--results'],{input:JSON.stringify(requests),encoding:'utf8'}))
  const normalize=r=>{const {generated_at,...rest}=r;return rest}
  assert.deepEqual(requests.map(r=>normalize(localAnswer(r,planRequest(r)))),python.map(normalize))
})

const temporal=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/phase2-local.json',import.meta.url)))
for (const c of temporal) test(`forecast scope and wording: ${c.id}`,()=>{
  const plan=planRequest(c.request)
  assert.equal(plan.operations[0].status,c.status)
  if(c.status==='ready') for(const fragment of c.fragments) assert.ok(localAnswer(c.request,plan).answer.includes(fragment))
})
test('temporal plans and deterministic answers match Python',()=>{
  const python=JSON.parse(execFileSync('python3',['tests/test_copilot_local.py','--temporal'],{encoding:'utf8'}))
  assert.deepEqual(temporal.map(c=>({plan:planRequest(c.request),answer:localAnswer(c.request,planRequest(c.request)).answer})),python)
})

test('Stop aborts request-owned evidence and never waits for an unrelated slow source',async()=>{
  const {fetchWithCancellation,waitForEvidence}=await import('../src/data/copilotAcquisition.js')
  const controller=new AbortController();let observed=false
  const scoped=fetchWithCancellation(controller.signal,(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{observed=true;reject(signal.reason)},{once:true})))
  const pending=waitForEvidence(scoped('https://example.test'),controller.signal)
  controller.abort(new DOMException('Cancelled','AbortError'))
  await assert.rejects(pending,{name:'AbortError'});assert.equal(observed,true)
})
test('server downgrades stale evidence rather than trusting a client current flag',async()=>{
  const request=requestFor(direct[0])
  const handle=createChatHandler({fetcher:noProvider,copilot:createCopilot({COPILOT_EXECUTION_MODE:'hybrid'})})
  const result=await frames(await post(handle,request))
  assert.equal(result[0].response.answer_status,'unsupported')
  assert.doesNotMatch(result.at(-1).message.content,/44°F/)
})

test('real HTTP structured adapter negotiates without probing and delivers local metadata once',async()=>{
  const {createServer}=await import('node:http')
  const {serveChat}=await import('../lib/node-handler.js')
  const server=createServer((req,res)=>serveChat(req,res,handler()))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  try {
    const browserFetch=(path,opts)=>fetch(`http://127.0.0.1:${server.address().port}`+path,opts)
    assert.equal((await getCopilotCapabilities({fetcher:browserFetch})).execution_mode,'hybrid')
    let responseCount=0,text='',timing
    for await(const token of streamChat([],{structuredRequest:requestFor(direct[0]),fetcher:browserFetch,onResponse:()=>responseCount++,onTiming:t=>timing=t})) text+=token
    assert.equal(responseCount,1);assert.match(text,/44°F/);assert.equal(timing.thinking_ms,undefined)
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
test('partial synthesis errors keep the committed response and never retry it',async()=>{
  const request=withLegacyContext({...corpus.base_request,question:'Explain the KB.'},'Full KB context',adaptEvidence)
  let posts=0
  const fetcher=async(url)=>url.endsWith('/api/tags')?Response.json({models:[{name:'qwen3:8b'}]}):(posts++,new Response('{"message":{"content":"Partial"}}\n{"error":"offline"}\n'))
  const result=await frames(await post(handler(fetcher,{OLLAMA_MODE:'local-first',OLLAMA_API_KEY:'fixture'}),request))
  assert.equal(posts,1)
  assert.equal(result.at(-2).response.answer_status,'partial')
  assert.equal(result.at(-2).response.answer,'Partial')
  assert.equal(result.at(-1).error.partial,true)
})

test('structured synthesis preserves legacy evidence/history with current grounding rules in both interfaces',()=>{
  const golden=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/legacy-prompts.json',import.meta.url)))
  for(const [runtime,scenarios] of Object.entries(golden)) for(const [id,messages] of Object.entries(scenarios)) {
    const context=/\n\nKNOWLEDGE BASE:\n([\s\S]*)\n\nRULES: /.exec(messages[0].content)[1]
    const request=withLegacyContext({...corpus.base_request,question:messages.at(-1).content,history:messages.slice(1,-1)},context,adaptEvidence)
    const expected=structuredClone(messages)
    expected[0].content=expected[0].content.replace(/RULES: [\s\S]*$/, 'RULES: '+COPILOT_RULES)
    assert.deepEqual(synthesisMessages(request),expected,`${runtime}/${id}`)
  }
})

test('missing phase-2 full synthesis context returns a clear request error before streaming',async()=>{
  const response=await post(handler(),{...corpus.base_request,question:'Explain the evacuation guidance.'})
  assert.equal(response.status,400)
  assert.match((await response.json()).error.message,/Full synthesis context is required/)
})

test('configured and available local/cloud providers remain untouched for a direct answer',async()=>{
  for(const mode of ['local-first','cloud-only']) {
    const calls=[]
    const available=async(url)=>{calls.push(url);return url.endsWith('/api/tags')?Response.json({models:[{name:'qwen3:8b'}]}):new Response('{"message":{"content":"unused"},"done":true}\n')}
    const result=await frames(await post(handler(available,{OLLAMA_MODE:mode,OLLAMA_API_KEY:'fixture'}),requestFor(direct[0])))
    assert.equal(result[0].response.execution_mode,'local_query');assert.deepEqual(calls,[])
  }
})

test('evaluated UI layer filters survive snapshot, scoped count acquisition and local HTTP completion',async()=>{
  const {evaluateMapBuilderFilter}=await import('../src/data/mapBuilderFilters.js')
  const {fetchMapLayerEvidence}=await import('../src/data/mapLayerEvidence.js')
  const masks=JSON.parse(readFileSync(new URL('../fixtures/long-island-sources/map-builder-filter-parity.json',import.meta.url))).geography_records
  for(const filterMode of ['unfiltered','operational','pseg_long_island']) {
    const layer={id:'fire',name:'USA Fire/EMS Stations (USGS) — Fire_Stations_EMS_Stations',url:'https://example.test/FeatureServer/2',sourceType:'Feature Layer',filterMode,where:'ACTIVE=1',visible:true,
      metadata:{capabilities:'Query',fields:[]},records:Array(500).fill({properties:{}})}
    layer.filter=evaluateMapBuilderFilter(layer,masks)
    assert.equal(typeof layer.filter,'object')
    const args={question:'How many features are in this layer?',name:'Long Island',layers:[layer],now:corpus.base_request.requested_at}
    const pending=makeCopilotRequest(args,adaptEvidence)
    assert.equal(pending.evidence[0].scope.filter,filterMode)
    assert.equal(planRequest(pending).operations[0].status,'acquire')
    const queries=[]
    const evidence=await fetchMapLayerEvidence(layer,masks,{fetchImpl:async(_url,opts)=>{queries.push(new URLSearchParams(opts.body));return Response.json({count:900})}})
    assert.equal(queries[0].get('where'),'ACTIVE=1')
    assert.equal(queries[0].has('geometry'),filterMode!=='unfiltered')
    const request=makeCopilotRequest({...args,layers:[evidence],now:new Date().toISOString()},adaptEvidence)
    const handle=createChatHandler({fetcher:noProvider,copilot:createCopilot({COPILOT_EXECUTION_MODE:'hybrid'})})
    const result=await frames(await post(handle,request))
    assert.equal(result[0].response.answer_status,'answered')
    assert.match(result.at(-1).message.content,/900 features/)
    assert.ok(result.at(-1).message.content.includes(`filter: ${filterMode}`))
    assert.doesNotMatch(result.at(-1).message.content,/500 features/)
  }
})
