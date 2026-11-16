// Local recording-only Edge fixture. All outbound network calls are forbidden.
import {readFileSync} from 'node:fs'
import {createServer} from 'node:http'
import handler from '../api/chat.js'
const cases=JSON.parse(readFileSync(new URL('../tests/fixtures/locations/source-adapters.json',import.meta.url))),weather=cases.find(x=>x.name==='hospital-real-kb').weather
const OriginalDate=Date,clock='2026-11-15T17:07:10Z';globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[clock]))}static now(){return OriginalDate.parse(clock)}}
const calls=[],captures=[]
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('/NYS_Civil_Boundaries/FeatureServer/')) {
  const geometry=JSON.parse(new URLSearchParams(options.body).get('geometry')),kind=geometry.x===-73.6993&&geometry.y===40.7765?'hospital':[-73.4138,-73.4134].includes(geometry.x)&&geometry.y===40.7288?'kfrg':null,layer=String(url).split('/').at(-2)
  if(!kind)throw Error('Unknown boundary fixture geometry')
  return new Response(readFileSync(new URL(`../tests/fixtures/jurisdiction/${kind}-${layer}.json`,import.meta.url)))
 }
 if(String(url)!=='https://ollama.com/api/chat')throw Error('Recording fixture forbids external calls')
 const payload=JSON.parse(options.body);calls.push(payload)
 const system=payload.messages[0].content,synthesis=system.includes('SYNTHESIS CHECKPOINT CONTRACT'),registry=synthesis?JSON.parse(system.split('Registry: ').at(-1).split(' All supported facts and material gaps render independently.')[0]):[]
 const content=JSON.stringify(synthesis?{version:'location-synthesis-proposal-v1',statements:registry}:{version:'operational-answer-v2',records:[]})
 return new Response(JSON.stringify({model:'local-recording',message:{content},done:true,done_reason:'stop'})+'\n')
}
createServer(async(req,res)=>{
 const headers={'access-control-allow-origin':'*','content-type':'application/json'}
 if(req.url?.startsWith('/_fixture/observation/')) {
  const id=req.url.split('/').at(-1),source=weather.find(s=>s.url.includes('/stations/'+id+'/'))
  res.writeHead(source?200:404,headers);res.end(JSON.stringify(source?.data||{}));return
 }
 if(req.url==='/_fixture/stats'){res.writeHead(200,headers);res.end(JSON.stringify({providerCalls:calls.length,calls,captures,cloudCalls:0}));return}
 if(req.url!=='/api/chat'){res.writeHead(404);res.end();return}
 const chunks=[];for await(const c of req)chunks.push(c)
 const response=await handler(new Request('http://127.0.0.1:5186/api/chat',{method:req.method,headers:req.headers,...(req.method!=='OPTIONS'?{body:Buffer.concat(chunks)}:{})}))
 const text=await response.text();if(req.method!=='OPTIONS')captures.push({request:JSON.parse(Buffer.concat(chunks)),frames:text.trim().split('\n').map(s=>{try{return JSON.parse(s)}catch{return {error:'non_json'}}})})
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(text)
}).listen(5186,'127.0.0.1',()=>console.log('Recording-only synthesis fixture on 127.0.0.1:5186'))
