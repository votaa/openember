// Local-only recording provider for browser verification. Never calls a cloud model.
import {createServer} from 'node:http'
import handler from '../api/chat.js'
let calls=0
const encoder=new TextEncoder()
globalThis.fetch=async(url,options)=>{
 if(url!=='https://ollama.com/api/chat')throw Error('Recording fixture forbids external calls')
 const body=JSON.parse(options.body);calls++
 const question=body.messages.at(-1).content
 const invalid=question.includes('reject-envelope-fixture')
 const raw=invalid?'Alert if water rises > 1 ft above the low-tide mark.':JSON.stringify({version:'operational-answer-v1',references:[]})
 let timer
 return new Response(new ReadableStream({start(controller){timer=setTimeout(()=>{controller.enqueue(encoder.encode(JSON.stringify({model:'recording-provider',message:{content:raw},done:true,done_reason:'stop'})+'\n'));controller.close()},2000)},cancel(){clearTimeout(timer)}}))
}
createServer(async(req,res)=>{
 if(req.url==='/_fixture/stats'){res.writeHead(200,{'access-control-allow-origin':'*','content-type':'application/json'});res.end(JSON.stringify({calls}));return}
 if(req.url!=='/api/chat'){res.writeHead(404);res.end();return}
 const chunks=[];for await(const chunk of req)chunks.push(chunk)
 const request=new Request('http://127.0.0.1:5182/api/chat',{method:req.method,headers:req.headers,...(req.method!=='OPTIONS'?{body:Buffer.concat(chunks)}:{})})
 const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers))
 const reader=response.body?.getReader();res.on('close',()=>reader?.cancel().catch(()=>{}))
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;if(!res.destroyed)res.write(value)}}catch{}finally{res.end()}
 else res.end()
}).listen(5182,'127.0.0.1',()=>console.log('Local recording fixture on 127.0.0.1:5182'))
