// Local-only recording provider for browser verification. Never calls a cloud model.
import {readFileSync} from 'node:fs'
import {createServer} from 'node:http'
import handler from '../api/chat.js'
const FixtureDate=Date,fixtureClock=FixtureDate.parse('2026-11-15T14:43:14Z')
globalThis.Date=class extends FixtureDate {constructor(...args){super(...(args.length?args:[fixtureClock]))}static now(){return fixtureClock}}
let calls=0
const encoder=new TextEncoder()
globalThis.fetch=async(url,options)=>{
 if(url!=='https://ollama.com/api/chat')throw Error('Recording fixture forbids external calls')
 const body=JSON.parse(options.body);calls++
 const question=body.messages.at(-1).content
 const invalid=question.includes('reject-envelope-fixture')
 const raw=invalid?'Alert if water rises > 1 ft above the low-tide mark.':JSON.stringify({version:'operational-answer-v2',records:[]})
 let timer
 return new Response(new ReadableStream({start(controller){timer=setTimeout(()=>{controller.enqueue(encoder.encode(JSON.stringify({model:'recording-provider',message:{content:raw},done:true,done_reason:'stop'})+'\n'));controller.close()},2000)},cancel(){clearTimeout(timer)}}))
}
createServer(async(req,res)=>{
 if(req.url?.startsWith('/_fixture/sources/')) {
  const key=req.url.split('/').at(-1),allowed=['nws_forecast','nws_hourly','nws_grid','nws_obs_kjfk','nws_obs_kisp']
  if(!allowed.includes(key)){res.writeHead(404);res.end();return}
  const file=key==='nws_obs_kisp'?'nws_obs_kjfk':key
  const source=JSON.parse(readFileSync(new URL('../docs/long-island/acceptance/corrective-9862a66-2026-11-15-normalized/sources/'+file+'.raw.json',import.meta.url)))
  if(key==='nws_obs_kisp'){source.geometry.coordinates=[-73.1,40.8];source.properties.station='https://api.weather.gov/stations/KISP';source.properties.temperature.value=10}
  res.writeHead(200,{'access-control-allow-origin':'*','content-type':'application/json'});res.end(JSON.stringify(source));return
 }
 if(req.url==='/_fixture/stats'){res.writeHead(200,{'access-control-allow-origin':'*','content-type':'application/json'});res.end(JSON.stringify({calls}));return}
 if(req.url!=='/api/chat'){res.writeHead(404);res.end();return}
 const chunks=[];for await(const chunk of req)chunks.push(chunk)
 const request=new Request('http://127.0.0.1:5182/api/chat',{method:req.method,headers:req.headers,...(req.method!=='OPTIONS'?{body:Buffer.concat(chunks)}:{})})
 const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers))
 const reader=response.body?.getReader();res.on('close',()=>reader?.cancel().catch(()=>{}))
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;if(!res.destroyed)res.write(value)}}catch{}finally{res.end()}
 else res.end()
}).listen(5182,'127.0.0.1',()=>console.log('Local recording fixture on 127.0.0.1:5182'))
