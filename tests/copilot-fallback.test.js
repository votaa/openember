import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createCopilot} from '../lib/copilot-service.js'
import {createChatHandler} from '../lib/chat-handler.js'
import {streamChat,responseLabel,timingLabel} from '../src/ollama-client.js'
const fixture=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/phase4-fallback.json',import.meta.url)))
async function run(c) {
 const request=structuredClone(fixture.requests[c.request]),calls=[]
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:c.mode,OLLAMA_API_KEY:c.key?'fixture-key':'',OLLAMA_LOCAL_NUM_CTX:'32768'}
 const fetcher=async(url,options)=>{
  calls.push({url,options});if(url.endsWith('/api/tags'))return Response.json({models:[{name:'qwen3:8b'}]})
  const kind=c.upstream
  if(kind==='http_error')return new Response('',{status:503})
  return new Response(kind==='malformed'?'not json\n':JSON.stringify({message:{thinking:kind==='thinking_error'?'private reasoning':'',content:kind==='partial_error'?'Partial answer':''}})+'\n'+JSON.stringify({error:'upstream failure'})+'\n')
 }
 const handler=createChatHandler({env,fetcher,copilot:createCopilot(env,{clock:()=>Date.parse(request.requested_at)})})
 const http=(path,options)=>handler(new Request('http://localhost'+path,options))
 const response=await http('/api/chat',{method:'POST',body:JSON.stringify({request})})
 const raw=await response.text(),frames=raw.trim().split('\n').map(JSON.parse)
 const metadata=frames.findLast(f=>f.response).response
 const {generated_at,...normalized}=metadata
 return {projection:{response:normalized,content:frames.map(f=>f.message?.content||'').join(''),posts:calls.filter(c=>c.url.endsWith('/api/chat')).length,done:frames.filter(f=>f.done).length,providers:frames.filter(f=>f.provider).length,errors:frames.filter(f=>f.error).length,label:responseLabel(metadata)},raw,calls}
}
for(const c of fixture.scenarios)test(`fallback and commitment: ${c.id}`,async()=>{
 const {projection:p,raw,calls}=await run(c)
 assert.equal(p.response.execution_mode,c.expected_mode);assert.equal(p.response.answer_status,c.expected_status)
 assert.equal(p.posts,c.posts);assert.equal(p.done,1)
 if(c.mode==='local-only')assert.ok(calls.every(c=>!c.url.startsWith('https://')))
 let content='',metadata,providers=0,timing,error
 try {for await(const token of streamChat([],{fetcher:async()=>new Response(raw),onResponse:r=>metadata=r,onProvider:()=>providers++,onTiming:t=>timing=t}))content+=token}catch(e){error=e}
 assert.equal(content,p.content);assert.equal(metadata.answer_status,c.expected_status)
 if(c.expected_mode==='rule_based_fallback'){
  assert.equal(error,undefined);assert.equal(providers,0);assert.equal(metadata.provider,null);assert.equal(metadata.model,null)
  assert.doesNotMatch(timingLabel(timing),/thinking|NaN/)
  assert.match(content,/assessment was not produced/)
  if(c.request==='facts')assert.match(content,/Low: 44°F; Wind: 7 to 10 mph W/)
  else if(c.request==='reports'){assert.match(content,/Direct electrical reports: 0/);assert.match(content,/not utility-confirmed outages/)}
  else assert.deepEqual(metadata.evidence_ids,[])
 }else {assert.ok(error);assert.doesNotMatch(content,/Available deterministic facts/)}
})
test('JavaScript and Python failure results, citations, scope and labels agree',async()=>{
 const js=[];for(const c of fixture.scenarios)js.push((await run(c)).projection)
 const py=JSON.parse(execFileSync('python3',['tests/test_copilot_fallback.py','--projections'],{encoding:'utf8'}))
 assert.deepEqual(js,py)
})
test('abort before discovery or after first frame never creates a fallback',async()=>{
 const request=fixture.requests.unknown,env={COPILOT_EXECUTION_MODE:'hybrid'},controller=new AbortController();let calls=0
 controller.abort()
 await assert.rejects(async()=>{for await(const _ of createCopilot(env).stream(request,{config:()=>({}),signal:controller.signal,fetcher:async()=>calls++})){}},{name:'AbortError'})
 assert.equal(calls,0)
 const active=new AbortController(),copilot=createCopilot(env,{clock:()=>Date.parse(request.requested_at)})
 const {configuration}=await import('../lib/ollama.js')
 const stream=copilot.stream(request,{config:()=>configuration({OLLAMA_MODE:'local-first',OLLAMA_API_KEY:'fixture-key',OLLAMA_LOCAL_NUM_CTX:'32768'}),signal:active.signal,fetcher:async(url)=>{calls++;return url.endsWith('/api/tags')?Response.json({models:[{name:'qwen3:8b'}]}):new Response('{"message":{"thinking":"pending"}}\n')}})
 assert.equal((await stream.next()).value.response.execution_mode,'llm_grounded')
 active.abort();await assert.rejects(stream.next(),{name:'AbortError'});await stream.return();assert.equal(calls,2)
})
test('cancelling a processing-limit response stops before fallback content',async()=>{
 const corpus=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/phase3-context.json',import.meta.url)))
 const request=corpus.cases.find(c=>c.id==='mandatory-overflow').request,controller=new AbortController()
 const stream=createCopilot({COPILOT_EXECUTION_MODE:'hybrid'}).stream(request,{signal:controller.signal,config:()=>({mode:'local-only',localNumCtx:4096}),fetcher:async()=>assert.fail('No provider for a processing limit')})
 assert.equal((await stream.next()).value.response.execution_mode,'rule_based_fallback')
 controller.abort();await assert.rejects(stream.next(),{name:'AbortError'});await stream.return()
})
