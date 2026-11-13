import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createChatHandler} from '../lib/chat-handler.js'
import {createCopilot} from '../lib/copilot-service.js'
import {streamChat} from '../src/ollama-client.js'
import {makeCopilotRequest,withLegacyContext} from '../src/data/copilotSnapshot.js'
import {adaptEvidence} from '../lib/copilot-evidence.js'
import {buildLocalContext} from '../lib/copilot-context.js'
import {planRequest} from '../lib/copilot-intent.js'
import {legacyReact} from './helpers/copilot-legacy.js'

const read=name=>JSON.parse(readFileSync(new URL(`../shared/copilot/fixtures/${name}.json`,import.meta.url)))
const input=read('legacy-input'),base=read('phase3-context').cases[0].request
for(const scenario of input.scenarios)for(const mode of ['cloud-only','local-first'])test(`React HTTP compatibility: ${scenario.id} / ${mode}`,async()=>{
 const request=structuredClone(base)
 request.question=scenario.question;request.answer_method='model';request.jurisdiction.enabled_kb_modules=scenario.enabled_modules
 for(const b of request.evidence.filter(b=>b.kind==='kb'))b.state={...b.state,availability:scenario.enabled_modules.includes(b.values.module_id)?'available':'omitted',omission_reason:scenario.enabled_modules.includes(b.values.module_id)?null:'selection'}
 const golden=legacyReact(input,scenario),calls=[]
 const legacyBody=golden[0].content.split('\n\nKNOWLEDGE BASE:\n')[1].split('\n\nRULES: ')[0]
 // Inject the exact legacy body produced by the production React builders.
 const full=withLegacyContext(request,legacyBody,adaptEvidence)
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:mode,OLLAMA_LOCAL_NUM_CTX:'65536',OLLAMA_API_KEY:'recording-only-key'}
 const upstream=async(url,options)=>{
  calls.push({url,body:options?.body?JSON.parse(options.body):null})
  if(url.endsWith('/api/tags'))return Response.json({models:[{name:'qwen3:8b'}]})
  if(!url.startsWith('https://ollama.com'))return new Response('',{status:503})
  return new Response('{"message":{"content":"Recorded acceptance response"},"done":true}\n')
 }
 const handler=createChatHandler({env,fetcher:upstream,copilot:createCopilot(env,{clock:()=>Date.parse(request.requested_at)})})
 let answer='',metadata,acquisitions=0
 for await(const text of streamChat([],{structuredRequest:request,fetcher:(path,options)=>handler(new Request('http://localhost'+path,options)),onResponse:r=>metadata=r,onContextRequest:async()=>{acquisitions++;return full}}))answer+=text
 const posts=calls.filter(c=>c.body)
 assert.equal(posts.length,mode==='cloud-only'?1:2)
 assert.equal(calls.filter(c=>c.url.endsWith('/api/tags')).length,mode==='cloud-only'?0:1)
 assert.equal(acquisitions,1);assert.equal(answer,'Recorded acceptance response')
 assert.equal(metadata.execution_mode,'llm_grounded');assert.equal(metadata.context.policy,'cloud_full')
 const cloud=posts.at(-1).body.messages
 assert.ok(cloud[0].content.startsWith(golden[0].content))
 assert.equal(cloud.at(-1).content,scenario.question)
 for(const id of scenario.enabled_modules)assert.ok(cloud[0].content.includes(input.kb[id].data))
 for(const [id,module] of Object.entries(input.kb))if(!scenario.enabled_modules.includes(id))assert.ok(!cloud[0].content.includes(module.data))
})

test('implicit, cross-module and custom KB questions keep all enabled local modules in full',()=>{
 for(const question of ['What do I need to know about evacuation?','Compare Fire Island and the Rockaways.','Explain unfamiliar resilience tradeoffs.','Use the plan and facilities to interpret coastal hazards.']){
  const request=structuredClone(base);request.question=question
  assert.equal(planRequest(request).outcome,'synthesis')
  const result=buildLocalContext(request,32768,planRequest(request))
  for(const b of request.evidence.filter(b=>b.kind==='kb'&&request.jurisdiction.enabled_kb_modules.includes(b.values.module_id)))assert.equal(result.selected.find(s=>s.id===b.id)?.values.content,b.values.content)
 }
 const request=structuredClone(read('phase3-context').cases.find(c=>c.id==='all-modules-large').request)
 const result=buildLocalContext(request,32768,planRequest(request))
 assert.match(result.messages[0].content,/LATE-KB-DELTA-19/)
})

test('configured Rockaway 311 source survives UI snapshot and HTTP answer with exact filter, window and zero category',async()=>{
 const config=JSON.parse(readFileSync(new URL('../config/jurisdiction.generated.json',import.meta.url)))
 const source=config.source_registry.find(s=>s.id==='nyc_311_electric_hazards_rockaway')
 const reports=input.phase4_results[source.id]
 const request=makeCopilotRequest({question:'Break down the available 311 electrical-hazard reports.',name:input.jurisdiction,enabled:[],reports,reportSource:source,now:reports.fetched_at},adaptEvidence)
 let calls=0,metadata,answer=''
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:'local-only',OLLAMA_API_KEY:''}
 const handler=createChatHandler({env,copilot:createCopilot(env,{clock:()=>Date.parse(reports.fetched_at)}),fetcher:()=>{calls++;throw Error('Provider forbidden')}})
 for await(const token of streamChat([],{structuredRequest:request,fetcher:(path,options)=>handler(new Request('http://localhost'+path,options)),onResponse:r=>metadata=r}))answer+=token
 assert.equal(calls,0);assert.equal(metadata.answer_status,'answered')
 for(const text of [source.endpoint,source.required_filter,reports.fetched_at,...Object.values(reports.report_window),...reports.aggregate_counts.map(r=>`${r.label}: ${r.total}`),'not utility-confirmed outages'])assert.ok(answer.includes(text),text)
})
