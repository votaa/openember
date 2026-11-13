/** Public/synthetic Phase 5 workloads through the real application coordinator.
 * node scripts/benchmark-copilot-acceptance.js OUTPUT_DIRECTORY [REPETITIONS] [both|hybrid]
 * Local installed model only; never loads .env, downloads models or calls cloud.
 * Native logs and answers require review separately from timing measurements.
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createCopilot} from '../lib/copilot-service.js'
import {configuration, routeChat, probeLocal} from '../lib/ollama.js'
import {nodeOllamaFetch} from '../lib/node-ollama-fetch.js'
import {legacyReact} from '../tests/helpers/copilot-legacy.js'

const [directory, repetitions='3', arms='both']=process.argv.slice(2)
if(!directory || !/^[1-9]\d*$/.test(repetitions) || !['both','hybrid'].includes(arms))throw Error('Usage: node scripts/benchmark-copilot-acceptance.js OUTPUT_DIRECTORY [REPETITIONS] [both|hybrid]')
mkdirSync(directory,{recursive:true})
const read=name=>JSON.parse(readFileSync(new URL(`../shared/copilot/fixtures/${name}.json`,import.meta.url)))
const base=read('phase3-context').cases[0].request, input=read('legacy-input')
// Define a smaller fixed catalog fixture for the repeated matrix. The original
// 120 KB stress source remains in phase3-context.json and its conformance tests.
base.evidence.find(b=>b.id==='noaa:space_catalog').values.raw.text='UNRELATED_LIVE_MARKER '+('Public synthetic catalog entry. '.repeat(200))
base.evidence.find(b=>b.id==='noaa:space_catalog').values.content=base.evidence.find(b=>b.id==='noaa:space_catalog').values.raw.text
// Same retained source population in both arms. The legacy builder keeps all live
// items and its original opening-upload excerpt; hybrid may retrieve late text.
input.noaa_items.push(...base.evidence.filter(b=>b.kind==='live').map(b=>({content:`${b.source.name}: ${JSON.stringify(b.values)}`})))
const workloads=read('grounding-regressions').cases.map(({id,question})=>[id,question])
const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:'local-only',OLLAMA_API_KEY:'',OLLAMA_LOCAL_HOST:'http://127.0.0.1:11434',OLLAMA_LOCAL_MODEL:process.env.OLLAMA_LOCAL_MODEL||'qwen3:4b-instruct',OLLAMA_LOCAL_NUM_CTX:'32768',OLLAMA_LOCAL_THINK:'false',OLLAMA_LOCAL_KEEP_ALIVE:'0',OLLAMA_LOCAL_STREAM_TIMEOUT_MS:'900000'}
const cfg=configuration(env)
const stop=new AbortController()
process.once('SIGINT',()=>stop.abort(new DOMException('Benchmark interrupted','AbortError')))
process.once('SIGTERM',()=>stop.abort(new DOMException('Benchmark terminated','AbortError')))
await probeLocal(cfg,nodeOllamaFetch)
const ps=await (await fetch(cfg.localHost+'/api/ps')).json()
if(ps.models?.length)throw Error('An installed model is already loaded; avoid interfering with another inference session.')
const results=[]
for(let sample=1;sample<=Number(repetitions);sample++)for(const [id,question] of workloads)for(const arm of (arms==='hybrid'?['hybrid']:(sample%2?['legacy','hybrid']:['hybrid','legacy']))) {
 stop.signal.throwIfAborted()
 const request=structuredClone(base);request.question=question
 const legacy=legacyReact({...input,history:request.history},{question,enabled_modules:request.jurisdiction.enabled_kb_modules})
 legacy[0].content+='\nCURRENT SELECTED FEATURE (synthetic fixture):\n'+JSON.stringify(request.evidence.find(b=>b.kind==='selected_feature'))
 writeFileSync(`${directory}/${id}-input.json`,JSON.stringify({request,legacy},null,2))
 const name=`${id}-${arm}-${sample}`,start=performance.now(),logStart=readFileSync(`${process.env.HOME}/.ollama/logs/server.log`,'utf8').length
 const result={name,workload:id,arm,sample,started_at:new Date().toISOString(),config:{...env},fixture_sha256:createHash('sha256').update(JSON.stringify({request,legacy})).digest('hex'),answer:'',first_answer_ms:null,complete:false,calls:[],native:{}}
 const fetcher=async(url,options)=>{
  if(!url.startsWith(cfg.localHost+'/'))throw Error('Nonlocal transport forbidden')
  result.calls.push({path:new URL(url).pathname,method:options?.method||'GET'})
  if(url.endsWith('/api/chat')){const messages=JSON.parse(options.body).messages;result.messages_sha256=createHash('sha256').update(JSON.stringify(messages)).digest('hex');result.input_characters=messages.reduce((n,m)=>n+m.content.length,0)}
  return nodeOllamaFetch(url,options)
 }
 const deadline=setTimeout(()=>stop.abort(new DOMException('Benchmark deadline exceeded','TimeoutError')),1200000)
 try {
  const signal=stop.signal
  const stream=arm==='hybrid'?createCopilot(env,{clock:()=>Date.parse(request.requested_at)}).stream(request,{config:()=>cfg,fetcher,signal}):routeChat(legacy,cfg,{fetcher,signal})
  for await(const frame of stream){
   if(frame.response)result.response=frame.response
   if(frame.error)result.error=frame.error
   if(frame.provider)result.provider=frame.provider
   if(frame.message?.content){result.first_answer_ms??=performance.now()-start;result.answer+=frame.message.content}
   if(frame.done&&!frame.error){result.complete=frame.done_reason!=='length';for(const k of ['done_reason','total_duration','load_duration','prompt_eval_count','prompt_eval_cached_count','prompt_eval_duration','eval_count','eval_duration'])if(frame[k]!==undefined)result.native[k]=frame[k]}
  }
 }catch(e){result.error={name:e.name,message:e.message}}finally{clearTimeout(deadline)}
 result.request_ms=performance.now()-start
 const log=readFileSync(`${process.env.HOME}/.ollama/logs/server.log`,'utf8').slice(logStart)
 const lines=log.split('\n').filter(l=>/n_ctx|task.n_tokens|cached n_tokens = 0|truncat|prompt eval time/.test(l))
 result.native_log=lines
 result.retention={allocated_32768:/n_ctx_slot = 32768/.test(log),explicit_no_truncation:/truncated = 0/.test(log),input_truncation:/truncating input|truncated = [1-9]/i.test(log),cold_cache:/cached n_tokens = 0/.test(log)}
 result.accepted_retention=result.retention.allocated_32768&&result.retention.explicit_no_truncation&&!result.retention.input_truncation&&result.retention.cold_cache&&result.native.prompt_eval_cached_count===0
 result.accepted_transport=result.complete&&!!result.answer&&result.provider?.provider==='local'&&result.calls.filter(c=>c.path==='/api/chat').length===1
 writeFileSync(`${directory}/${name}.json`,JSON.stringify(result,null,2)+'\n')
 results.push(result);writeFileSync(`${directory}/results.json`,JSON.stringify(results,null,2)+'\n')
 console.log(JSON.stringify({name,seconds:result.request_ms/1000,tokens:result.native.prompt_eval_count,retention:result.retention,transport:result.accepted_transport,error:result.error}))
 if(!result.accepted_transport||!result.accepted_retention)throw Error('Native acceptance transport/retention failed; stopped further submissions.')
}
