/** Cached synthetic requests through the production HTTP adapter, no network. */
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {createCopilot} from '../lib/copilot-service.js'
import {createChatHandler} from '../lib/chat-handler.js'
import {streamChat} from '../src/ollama-client.js'
import {adaptEvidence} from '../lib/copilot-evidence.js'
const corpus=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/conformance.json',import.meta.url)))
const blocks=Object.fromEntries(corpus.adapters.map(c=>[c.id,adaptEvidence(c.kind,c.raw,c.metadata)]))
const output=[]
for(const id of ['forecast-low-wind','map','reports','map_hidden','reports_partial','ambiguous-layers']){
 const c=corpus.planning_cases.find(c=>c.id===id),request={...structuredClone(corpus.base_request),...structuredClone(c.request),evidence:c.evidence_ids.map(id=>structuredClone(blocks[id]))}
 let providerCalls=0
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:'local-only',OLLAMA_API_KEY:''}
 const handler=createChatHandler({env,copilot:createCopilot(env,{clock:()=>Date.parse(request.requested_at)}),fetcher:()=>{providerCalls++;throw Error('Provider forbidden')}})
 const samples=[];let result
 for(let n=0;n<30;n++){
  let text='';const started=performance.now()
  for await(const token of streamChat([],{structuredRequest:request,fetcher:(path,options)=>handler(new Request('http://localhost'+path,options)),onResponse:r=>result=r}))text+=token
  samples.push(performance.now()-started)
  assert.equal(text,result.answer);assert.equal(result.execution_mode,'local_query')
 }
 assert.equal(providerCalls,0)
 const sorted=[...samples].sort((a,b)=>a-b)
 output.push({id,answer_status:result.answer_status,answer:result.answer,provider_generation_and_discovery_calls:providerCalls,sample_count:30,min_ms:sorted[0],median_ms:sorted[15],max_ms:sorted.at(-1),samples_ms:samples})
}
if(!process.argv[2])throw Error('Output JSON path required')
writeFileSync(process.argv[2],JSON.stringify({scope:'In-process production HTTP adapter/client; cached fixed snapshots; excludes network acquisition and browser paint.',results:output},null,2)+'\n')
console.log(JSON.stringify(output.map(({id,median_ms,max_ms})=>({id,median_ms,max_ms}))))
