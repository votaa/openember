import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {buildLocalContext} from '../lib/copilot-context.js'
import {planRequest} from '../lib/copilot-intent.js'
import {createCopilot} from '../lib/copilot-service.js'
import {createChatHandler} from '../lib/chat-handler.js'
import {streamChat} from '../src/ollama-client.js'
import {withLegacyContext} from '../src/data/copilotSnapshot.js'
import {adaptEvidence} from '../lib/copilot-evidence.js'
const fixture=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/phase3-context.json',import.meta.url)))
function exactResults(request,plan){const operations=plan.operations.filter(op=>op.status==='ready'&&op.intent!=='synthesis');return operations.length?localAnswer(request,{...plan,operations}).answer:''}
import {localAnswer} from '../lib/copilot-local-queries.js'
const projections=()=>fixture.cases.map(c=>buildLocalContext(c.request,c.allocated_context,planRequest(c.request),exactResults(c.request,planRequest(c.request))))
for(const c of fixture.cases)test(`bounded context: ${c.id}`,()=>{
 const result=buildLocalContext(c.request,c.allocated_context,planRequest(c.request),exactResults(c.request,planRequest(c.request)))
 for(const block of c.request.evidence)if(block.kind==='kb'&&c.request.jurisdiction.enabled_kb_modules.includes(block.values.module_id))assert.equal(result.selected.find(b=>b.id===block.id)?.values.content,block.values.content)
 assert.equal(result.messages.at(-1).content,c.request.question)
 if(!result.context.processing_limit)assert.equal(result.context.accounting.fits_estimate,true)
 assert.equal(result.context.accounting.exact,false)
})
test('JavaScript and Python produce identical selected evidence, context, accounting and messages',()=>{
 const python=JSON.parse(execFileSync('python3',['tests/test_copilot_context.py','--projections'],{encoding:'utf8'}))
 assert.deepEqual(projections(),python)
})
test('late passage, source selection and history exclusions are explicit',()=>{
 const out=projections(),late=out.find((_,i)=>fixture.cases[i].id==='late-document-question')
 assert.match(late.messages[0].content,/DELTA-19/);assert.doesNotMatch(late.messages[0].content,/UNRELATED_LIVE_MARKER/)
 const disabled=out.find((_,i)=>fixture.cases[i].id==='disabled-kb-history')
 assert.doesNotMatch(JSON.stringify(disabled.messages),/OLD_DISABLED_KB_FACT/)
 const hidden=out.find((_,i)=>fixture.cases[i].id==='hidden-layer-history')
 assert.doesNotMatch(JSON.stringify(hidden.messages),/OLD_HIDDEN_LAYER_COUNT/)
 assert.ok(disabled.context.warnings.length)
})
test('pre-stream fallback requests full cloud context in the original stream and never reuses compact local messages',async()=>{
 const request=fixture.cases.find(c=>c.id==='late-document-question').request
 const full=withLegacyContext(request,'FULL_CLOUD_LATE_FACT '+('cloud only '.repeat(10000)),adaptEvidence)
 const calls=[];let acquisitions=0
 const upstream=async(url,options)=>{calls.push({url,options});if(url.endsWith('/api/tags'))return Response.json({models:[{name:'qwen3:8b'}]});if(!url.startsWith('https://ollama.com'))return new Response('',{status:503});return new Response('{"message":{"content":"Grounded"},"done":true}\n')}
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:'local-first',OLLAMA_LOCAL_NUM_CTX:'32768',OLLAMA_API_KEY:'fixture-key'}
 const handle=createChatHandler({env,fetcher:upstream,copilot:createCopilot(env,{clock:()=>Date.parse(request.requested_at)})})
 const fetcher=(path,options)=>handle(new Request('http://localhost'+path,options))
 let text='',metadata
 for await(const token of streamChat([],{structuredRequest:request,fetcher,onResponse:r=>metadata=r,onContextRequest:async()=>{acquisitions++;return full}}))text+=token
 const posts=calls.filter(c=>c.url.endsWith('/api/chat'))
 assert.equal(posts.length,2);assert.equal(acquisitions,1);assert.equal(text,'Grounded')
 assert.doesNotMatch(JSON.parse(posts[0].options.body).messages[0].content,/FULL_CLOUD_LATE_FACT/)
 assert.match(JSON.parse(posts[1].options.body).messages[0].content,/FULL_CLOUD_LATE_FACT/)
 assert.equal(metadata.context.policy,'cloud_full')
})
test('mandatory budget failure is a local processing limit, not an automatic cloud spend',async()=>{
 const c=fixture.cases.find(c=>c.id==='mandatory-overflow'),calls=[]
 const copilot=createCopilot({COPILOT_EXECUTION_MODE:'hybrid'},{clock:()=>Date.parse(c.request.requested_at)})
 const frames=[]
 for await(const frame of copilot.stream(c.request,{config:()=>({mode:'local-first',localNumCtx:4096}),fetcher:async()=>{calls.push(1);throw Error('forbidden')}}))frames.push(frame)
 assert.deepEqual(calls,[]);assert.equal(frames[0].response.execution_mode,'rule_based_fallback')
 assert.match(frames.at(-1).message.content,/processing limit/)
})

import {createCloudContextBroker} from '../lib/copilot-cloud-context.js'
import {contextForecastPeriods} from '../lib/copilot-forecast.js'
import {sourceNeeded,scopeKey} from '../lib/copilot-context.js'
import {withSynthesisSnapshot} from '../src/data/copilotSnapshot.js'
import {POLICY} from '../lib/copilot-contract.js'
import {routeChat,configuration} from '../lib/ollama.js'
import {cloudContext} from '../lib/copilot-service.js'
test('projection leaves the request immutable; explicit new follow-up date overrides history',()=>{
 const request=structuredClone(fixture.cases.find(c=>c.id==='gust-grid').request),before=JSON.stringify(request)
 buildLocalContext(request,32768,planRequest(request));assert.equal(JSON.stringify(request),before)
 request.question='What about tomorrow’s gusts?';request.history=[{role:'user',content:'What is tonight’s wind?'}]
 const periods=request.evidence.filter(b=>b.kind==='forecast').flatMap(b=>b.values.periods)
 assert.ok(contextForecastPeriods(request,periods).every(p=>!/^tonight$/i.test(p.name)))
})
test('KB-only questions acquire no live endpoints; relevant gust grids remain eligible',()=>{
 const request=structuredClone(fixture.cases[0].request)
 request.question='Explain the KB flood zones'
 for(const ep of [{id:'nws_forecast',name:'Forecast'},{id:'nws_grid',name:'Wind grid'},{id:'usgs_water',name:'Water'}])assert.equal(sourceNeeded(ep,request),false)
 request.question='What is tonight’s maximum wind gust?'
 assert.equal(sourceNeeded({id:'nws_grid',name:'NWS grid'},request),true)
})
test('snapshot retains full supported Unicode uploads and marks oversize or irrelevant sources explicitly',()=>{
 const request=structuredClone(fixture.cases[0].request);request.evidence=[];request.question='Explain the uploaded DELTA plan'
 const out=withSynthesisSnapshot(request,{files:[{name:'unicode.txt',content:'🌊'.repeat(5000)+'DELTA late passage'},{name:'large.txt',content:'x'.repeat(1048577)}],sources:[{result:{ep:{id:'nws_grid',name:'NWS grid'},ok:true,data:{marker:'UNRELATED_LIVE_MARKER'}}}]},adaptEvidence,POLICY)
 assert.match(out.evidence[0].values.passages[0].text,/DELTA/)
 assert.equal(out.evidence[0].values.passages[0].end,5018)
 assert.equal(out.evidence[1].state.completeness,'partial')
 assert.match(out.evidence[1].limitations.join(' '),/limit exceeded/)
 assert.match(out.evidence[2].values.content_omitted,/Not needed/)
 assert.equal(out.evidence[2].state.availability,'available')
})
test('cloud-context rendezvous rejects changed scope and expires or cancels without retaining tokens',async()=>{
 const request=fixture.cases[0].request,full=withLegacyContext(request,'FULL',adaptEvidence),broker=createCloudContextBroker({deadlineMs:15})
 const controller=new AbortController(),pending=broker.wait(request,controller.signal)
 assert.throws(()=>broker.provide(pending.token,{...full,question:'changed'}),/preserve/)
 controller.abort();await assert.rejects(pending.promise);assert.equal(broker.size(),0)
 const expired=broker.wait(request);await Promise.all([assert.rejects(expired.promise,/timed out/),new Promise(resolve=>setTimeout(resolve,25))]);assert.equal(broker.size(),0)
 assert.throws(()=>broker.provide(expired.token,full),/no longer active/)
})
test('provider context callbacks cannot trigger replay after a native first frame',async()=>{
 const prepared=[],posts=[]
 const cfg=configuration({OLLAMA_MODE:'local-first',OLLAMA_API_KEY:'fixture'})
 const fetcher=async(url)=>{if(url.endsWith('/api/tags'))return Response.json({models:[{name:cfg.localModel}]});posts.push(url);return new Response('{"message":{"thinking":"native started"}}\n')}
 const frames=[];for await(const f of routeChat([],cfg,{fetcher,prepareMessages:p=>{prepared.push(p);return {messages:[{role:'user',content:'fixture'}]}}}))frames.push(f)
 assert.deepEqual(prepared,['local']);assert.equal(posts.length,1);assert.equal(frames.at(-1).error.partial,true)
})
test('typed cloud context retains unbounded legacy content and discloses upload excerpt policy',()=>{
 const request=fixture.cases[0].request,body='FULL_CLOUD_'+('retained '.repeat(12000))+'LATE_CLOUD_SENTINEL'
 const result=cloudContext(withLegacyContext(request,body,adaptEvidence),planRequest(request))
 assert.ok(result.messages[0].content.includes(body));assert.equal(result.context.policy,'cloud_full')
 assert.match(result.context.warnings.join(' '),/opening-excerpt/)
 assert.ok(scopeKey(request).startsWith('scope-'))
})
