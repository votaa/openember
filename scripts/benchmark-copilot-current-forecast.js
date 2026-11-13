/** One live-source precipitation check, forced through the local model.
 * node scripts/benchmark-copilot-current-forecast.js OUTPUT_DIRECTORY [--prepare-only]
 * Does not read .env, download models or call a cloud provider. Keep the captured
 * snapshot for comparison: a later live refresh can contain different values.
 */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {NWS,JURISDICTION,KNOWLEDGE_BASE} from '../src/config/jurisdiction.js'
import {makeCopilotRequest,withSynthesisSnapshot} from '../src/data/copilotSnapshot.js'
import {adaptEvidence} from '../lib/copilot-evidence.js'
import {POLICY} from '../lib/copilot-contract.js'
import {createCopilot} from '../lib/copilot-service.js'
import {configuration} from '../lib/ollama.js'
import {nodeOllamaFetch} from '../lib/node-ollama-fetch.js'

const [directory,option]=process.argv.slice(2)
if(!directory||(option&&option!=='--prepare-only'))throw Error('Usage: node scripts/benchmark-copilot-current-forecast.js OUTPUT_DIRECTORY [--prepare-only]')
mkdirSync(directory,{recursive:true})
const save=(name,value)=>writeFileSync(`${directory}/${name}`,JSON.stringify(value,null,2)+'\n')
const question='What is the probability of precipitation in tonight’s supplied forecast? State the percentage, forecast period, and source URL. Distinguish a missing value from 0%. Explain whether that percentage establishes that no rain is expected.'
const url=NWS.forecast_url
if(new URL(url).origin!=='https://api.weather.gov')throw Error('Expected the configured public NWS source')
const controller=new AbortController()
process.once('SIGINT',()=>controller.abort(new DOMException('Interrupted','AbortError')))
process.once('SIGTERM',()=>controller.abort(new DOMException('Terminated','AbortError')))
const fetchDeadline=setTimeout(()=>controller.abort(new DOMException('NWS fetch deadline exceeded','TimeoutError')),30000)
let response,raw
try{
 response=await fetch(url,{headers:{'User-Agent':'OpenEmber current-forecast comparison'},signal:controller.signal})
 if(!response.ok)throw Error(`NWS forecast HTTP ${response.status}`)
 raw=await response.json()
}finally{clearTimeout(fetchDeadline)}
const now=new Date().toISOString()
const tonight=raw.properties?.periods?.find(p=>/^tonight$/i.test(p.name)&&Date.parse(p.endTime)>Date.parse(now))
if(!tonight)throw Error('No current Tonight period; inspect coverage before submitting an inference request')
save('forecast.json',{url,fetched_at:now,http_date:response.headers.get('date'),last_modified:response.headers.get('last-modified'),raw})
let request=makeCopilotRequest({question,name:JURISDICTION.name,timezone:JURISDICTION.timezone,enabled:Object.keys(KNOWLEDGE_BASE),forecast:{data:raw,fetched_at:now,ep:{name:'NWS point forecast',url}},now},adaptEvidence)
request=withSynthesisSnapshot({...request,answer_method:'model'},{kb:KNOWLEDGE_BASE},adaptEvidence,POLICY)
save('request.json',request)
const expectation={period:tonight.name,start:tonight.startTime,end:tonight.endTime,structured_probability:tonight.probabilityOfPrecipitation?.value??null,narrative:tonight.detailedForecast,source_url:url,fetched_at:now,source_update_time:raw.properties.updateTime}
save('expectation.json',expectation)
writeFileSync(`${directory}/cloud-query.txt`,question+'\n')
console.log(JSON.stringify({prepared:true,expectation}))
if(option!=='--prepare-only'){
 const env={COPILOT_EXECUTION_MODE:'hybrid',OLLAMA_MODE:'local-only',OLLAMA_API_KEY:'',OLLAMA_LOCAL_HOST:'http://127.0.0.1:11434',OLLAMA_LOCAL_MODEL:process.env.OLLAMA_LOCAL_MODEL||'qwen3:8b',OLLAMA_LOCAL_NUM_CTX:'32768',OLLAMA_LOCAL_THINK:'false',OLLAMA_LOCAL_KEEP_ALIVE:'0',OLLAMA_LOCAL_STREAM_TIMEOUT_MS:'900000'}
 const cfg=configuration(env),localHost=cfg.localHost
 const ps=await(await fetch(localHost+'/api/ps',{signal:AbortSignal.timeout(5000)})).json()
 if(ps.models?.length)throw Error('An Ollama model is already loaded; avoid interfering with another request')
 const logPath=`${process.env.HOME}/.ollama/logs/server.log`,logStart=readFileSync(logPath,'utf8').length,start=performance.now()
 const result={question,expectation,config:env,request_sha256:createHash('sha256').update(JSON.stringify(request)).digest('hex'),answer:'',first_answer_ms:null,calls:[],native:{},memory:[]}
 const command=(file,args)=>{try{return execFileSync(file,args,{encoding:'utf8',timeout:3000}).trim()}catch(e){return {error:e.message}}}
 let pending=Promise.resolve(),sampling=false
 async function memory(){
  if(sampling)return
  sampling=true
  try{const sample={at:new Date().toISOString(),swap:command('/usr/sbin/sysctl',['vm.swapusage']),pressure:command('/usr/sbin/sysctl',['kern.memorystatus_vm_pressure_level'])};try{sample.ollama=await(await fetch(localHost+'/api/ps',{signal:AbortSignal.timeout(3000)})).json()}catch(e){sample.error=e.message}result.memory.push(sample)}finally{sampling=false}
 }
 await memory()
 const timer=setInterval(()=>{pending=memory()},5000)
 const deadline=setTimeout(()=>controller.abort(new DOMException('Deadline exceeded','TimeoutError')),900000)
 const fetcher=async(target,options)=>{
  if(!target.startsWith(localHost+'/'))throw Error('Nonlocal inference forbidden')
  result.calls.push({path:new URL(target).pathname,method:options?.method||'GET'})
  if(target.endsWith('/api/chat')){const body=JSON.parse(options.body);save('messages.json',body.messages);result.messages_sha256=createHash('sha256').update(JSON.stringify(body.messages)).digest('hex')}
  return nodeOllamaFetch(target,options)
 }
 try{
  for await(const frame of createCopilot(env).stream(request,{config:()=>cfg,fetcher,signal:controller.signal})){
   if(frame.response)result.response=frame.response
   if(frame.provider)result.provider=frame.provider
   if(frame.error)result.error=frame.error
   if(frame.message?.content){if(result.first_answer_ms===null){result.first_answer_ms=performance.now()-start;console.log(JSON.stringify({first_answer_seconds:result.first_answer_ms/1000}))}result.answer+=frame.message.content}
   if(frame.done&&!frame.error){result.complete=frame.done_reason!=='length';for(const key of ['done_reason','load_duration','prompt_eval_count','prompt_eval_cached_count','prompt_eval_duration','eval_count','eval_duration','total_duration'])if(frame[key]!==undefined)result.native[key]=frame[key]}
  }
 }catch(e){result.error={name:e.name,message:e.message}}
 finally{result.request_ms=performance.now()-start;clearInterval(timer);clearTimeout(deadline);await pending;await memory()}
 const log=readFileSync(logPath,'utf8').slice(logStart)
 result.native_log=log.split('\n').filter(line=>/n_ctx|task.n_tokens|cached n_tokens = 0|truncat|prompt eval time/.test(line))
 result.retention={allocated_32768:/n_ctx_slot = 32768/.test(log),explicit_no_truncation:/truncated = 0/.test(log),input_truncation:/truncating input|truncated = [1-9]/i.test(log),cold_cache:/cached n_tokens = 0/.test(log)&&result.native.prompt_eval_cached_count===0}
 result.accepted_retention=result.retention.allocated_32768&&result.retention.explicit_no_truncation&&!result.retention.input_truncation&&result.retention.cold_cache
 result.accepted_transport=!!result.complete&&!!result.answer&&result.provider?.provider==='local'&&result.calls.filter(c=>c.path==='/api/chat').length===1
 result.manual_quality_review_required=true
 save('result.json',result)
 writeFileSync(`${directory}/answer.md`,result.answer+'\n')
 console.log(JSON.stringify({seconds:result.request_ms/1000,retention:result.retention,transport:result.accepted_transport,error:result.error}))
 if(!result.accepted_transport||!result.accepted_retention)process.exitCode=1
}
