#!/usr/bin/env node
// Run only against an explicitly selected preview, with an already captured public snapshot.
// This script never reads or records credentials; the optional Vercel CLI uses its existing authentication internally.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {resolve,join} from 'node:path'
import {JURISDICTION,KNOWLEDGE_BASE} from '../src/config/jurisdiction.js'
import {summarizeWeather} from '../src/data/weatherContext.js'
import {reportWindowMessage} from '../src/data/regional/reportWindow.js'
import {uploadedDocumentContext,validateUploads,validateCloudMessages} from '../src/data/cloudUploads.js'
import {buildCopilotSystemPrompt} from '../src/data/copilotPrompt.js'
import {weatherSnapshots,SCOPE_VERSION} from '../src/data/requestScope.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
const root=fileURLToPath(new URL('../',import.meta.url))
const output=resolve(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||join(root,'docs/long-island/acceptance/cloud-preview-2026-11-14'))
if(existsSync(join(output,'run.json')))throw Error('This directory already contains a live attempt. Use a new capture directory; existing evidence will not be overwritten.')
const preview='https://openember-nmymjfogq-ember-li.vercel.app'
const send=process.argv.includes('--send')
const authenticated=process.argv.includes('--transport=vercel-cli')
let curlTiming=null
async function authenticatedFetch(path,options) {
 const dir=mkdtempSync(join(tmpdir(),'openember-preview-http-')),headers=join(dir,'headers'),raw=join(dir,'response')
 writeFileSync(headers,'',{mode:0o600});writeFileSync(raw,'',{mode:0o600})
 try {
  const {stdout}=await promisify(execFile)(process.env.PREVIEW_VERCEL_CLI||'vercel',['curl',preview+path,'--','--request','POST','--header','Content-Type: application/json','--data-binary','@'+join(output,'client-request.json'),'--silent','--show-error','--no-buffer','--dump-header',headers,'--output',raw,'--max-time','180','--write-out','%{json}'],{timeout:190000,maxBuffer:1048576})
  curlTiming=JSON.parse(stdout)
  const blocks=readFileSync(headers,'utf8').trim().split(/\r?\n\r?\n/),last=blocks.at(-1).split(/\r?\n/),status=Number(last[0].split(' ')[1])
  const filtered=Object.fromEntries(last.slice(1).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).toLowerCase(),line.slice(i+1).trim()]}).filter(([key])=>['date','content-type','x-vercel-id','x-vercel-cache'].includes(key)))
  return new Response(readFileSync(raw),{status,headers:filtered})
 } finally {rmSync(dir,{recursive:true,force:true})}
}
const question="Using the uploaded plan and enabled KB, explain tonight's weather impacts on this facility. Include CEDAR-731, amber cones, radio channel and incident commander. Give the low, wind and exact forecast URL; distinguish facts from possible impacts."
const results=JSON.parse(readFileSync(join(output,'weather-capture.json'),'utf8'))
const app=readFileSync(join(root,'src/App.jsx'),'utf8')
const fragment=app.slice(app.indexOf('function summarizeAPIData('),app.indexOf('async function* streamOllama('))
const buildContext=new Function('CFG','summarizeWeather','reportWindowMessage','uploadedDocumentContext',fragment+';return buildContextRT')({state:'NY'},summarizeWeather,reportWindowMessage,uploadedDocumentContext)
const summarizeNOAA=new Function('summarizeWeather',app.slice(app.indexOf('function summarizeNOAA('),app.indexOf('async function fetchNOAA('))+';return summarizeNOAA')(summarizeWeather)
const doc={name:'synthetic-plan.txt',content:readFileSync(join(root,'tests/fixtures/uploads/synthetic-plan.txt'),'utf8')}
const enabled=Object.keys(KNOWLEDGE_BASE)
const context=buildContext([doc],[],enabled,KNOWLEDGE_BASE,JURISDICTION.name)+'--- NOAA DATA ---\n'+results.map(r=>r.ok?`[NOAA: ${r.ep.name}]\nFetched: ${r.fetchedAt}\nSource: ${r.ep.url}\n\n${summarizeNOAA(r)}`:`[NOAA: ${r.ep.name}] unavailable at ${r.fetchedAt}: ${r.error}`).join('\n\n')+'\n\n'
const initial='EMBER initialized — Long Island (NY)\nBackend: Ollama Cloud · gpt-oss:120b-cloud\n\nKnowledge base loaded · NOAA feeds auto-fetching · Map ready\nUse ⚙️ Settings tab to change jurisdiction, KB text, and map points.'
const messages=[{role:'assistant',content:initial},{role:'user',content:question}]
const sha=text=>createHash('sha256').update(text).digest('hex')
const save=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')
mkdirSync(output,{recursive:true})
save('context.txt',context);save('upload.txt',doc.content);save('enabled-kb.json',{enabled,modules:KNOWLEDGE_BASE});save('question.txt',question+'\n')
const requestedAt=new Date().toISOString()
const input={version:SCOPE_VERSION,browser_requested_at:requestedAt,weather:weatherSnapshots(results,JURISDICTION)}
const streamSource=app.slice(app.indexOf('async function* streamOllama('),app.indexOf('// ── Full NOAA',app.indexOf('async function* streamOllama('))).replaceAll('import.meta.env','testEnv')
let body,wirePromise,wire='',http={},started,firstContent,finished,frameCount=0,thinkingFieldsOmitted=0,finalFrames=[]
const transport=async(path,options)=>{
 body=JSON.parse(options.body);save('client-request.json',body);save('client-messages.json',body.messages)
 const estimatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z')
 const reconstructed=scopedCloudMessages(body,estimatedAt)
 save('provider-request-RECONSTRUCTED.json',{provenance:'Reconstructed from deployed-commit code, NOT observed server egress. Receipt time estimated from client send; exact server timestamp unavailable.',estimated_received_at:estimatedAt,payload:{model:'gpt-oss:120b-cloud',stream:true,messages:reconstructed.messages,options:{num_predict:8192}}})
 save('scope-RECONSTRUCTED.json',reconstructed.scope)
 if(!send)return new Response('{"message":{"content":"DRY RUN ONLY"},"done":true}\n')
 started=Date.now()
 const response=authenticated?await authenticatedFetch(path,options):await fetch(preview+path,{...options,signal:AbortSignal.timeout(180000)})
 http={status:response.status,headers:Object.fromEntries([...response.headers].filter(([k])=>['date','content-type','x-vercel-id','x-vercel-cache'].includes(k))),request_started_utc:new Date(started).toISOString(),headers_received_utc:new Date().toISOString()}
 const [capture,delivery]=response.body.tee()
 wirePromise=(async()=>{const reader=capture.getReader(),decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;wire+=decoder.decode(value,{stream:true})}wire+=decoder.decode()})()
 return new Response(delivery,{status:response.status,headers:response.headers})
}
const stream=new Function('buildCopilotSystemPrompt','validateUploads','validateCloudMessages','getRuntimeKey','CFG','OLLAMA_MODEL','fetch','testEnv',streamSource+';return streamOllama')(buildCopilotSystemPrompt,validateUploads,validateCloudMessages,()=>'',JURISDICTION,'gpt-oss:120b-cloud',transport,{})
let answer='',error=null
try {for await(const token of stream(messages,context,undefined,'',JURISDICTION.name,[doc],input)){if(!firstContent)firstContent=Date.now();answer+=token}if(wirePromise)await wirePromise}
catch(e){error={name:e.name,message:e.message}}
finished=Date.now()
if(send){
 const rows=[]
 for(const line of wire.split('\n').filter(s=>s.trim())){
  try {const row=JSON.parse(line);frameCount++;if(row.message?.thinking!==undefined){delete row.message.thinking;thinkingFieldsOmitted++}if(row.done||row.error)finalFrames.push(row);rows.push(row)}catch{rows.push({unparsed_response:line})}
 }
 save('response.ndjson',rows.map(r=>JSON.stringify(r)).join('\n')+'\n');save('answer.md',answer+'\n')
}
const record={preview,transport:authenticated?'Vercel CLI authenticated HTTP (buffered delivery to React stream parser)':'Node fetch',curl_timing:curlTiming?{http_code:curlTiming.http_code,time_starttransfer:curlTiming.time_starttransfer,time_total:curlTiming.time_total,size_upload:curlTiming.size_upload,size_download:curlTiming.size_download}:null,commit:'7bdb1f723df99c7cb23a10420ccdf28861757f6a',live:send,question,enabled_kb:enabled,history:'Clean-start initialization message; original hosted history was not captured.',upload:{name:doc.name,bytes:Buffer.byteLength(doc.content),sha256:sha(doc.content)},weather_capture_sha256:sha(readFileSync(join(output,'weather-capture.json'))),client_request_sha256:body?sha(readFileSync(join(output,'client-request.json'))):null,client_request_canonical_sha256:body?sha(JSON.stringify(body)):null,client_message_bytes:body?body.messages.reduce((n,m)=>n+Buffer.byteLength(m.content),0):null,provider_egress_observed:false,provider_config_observed:{host:'https://ollama.com',model:'gpt-oss:120b-cloud',source:'Read-only Vercel project settings; no credentials retrieved'},http,frame_count:frameCount,thinking_fields_omitted:thinkingFieldsOmitted,response_models:[...new Set(finalFrames.map(f=>f.model).filter(Boolean))],final_frames:finalFrames,error,timing_ms:started?{[authenticated?'buffered_parser_first_content':'stream_parser_first_content']:firstContent-started,total:finished-started}:null,answer_sha256:send?sha(answer):null,limitations:['Original hosted raw weather and exact history were not retained; this is a new fixed capture, not an exact before/after replay.','Client request/messages and visible whole answer are actual captures. Provider-added messages and exact server receipt time are not observable from this deployment; reconstructed files are explicitly labelled.','Transport is the production React streaming function invoked from Node against the hosted Edge proxy, not a browser UI acceptance run.']}
save(send?'run.json':'preflight.json',record)
console.log(JSON.stringify({live:send,http:http.status,transport:record.transport,enabled,client_message_bytes:record.client_message_bytes,response_models:record.response_models,frame_count:frameCount,timing_ms:record.timing_ms,error,output},null,2))
if(error||send&&http.status!==200)process.exitCode=1
