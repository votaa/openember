import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {UPLOAD_LIMITS,UPLOAD_GUIDANCE,validateFileMetadata,validateUploads,decodeUpload,uploadedDocumentContext,validateCloudMessages} from '../src/data/cloudUploads.js'
import handler from '../api/chat.js'
const doc={name:'synthetic-plan.txt',content:readFileSync(new URL('./fixtures/uploads/synthetic-plan.txt',import.meta.url),'utf8')}
const jsonRequest=body=>new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-ollama-key':'recording-only-key'},body:JSON.stringify(body)})
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const contextSource=app.slice(app.indexOf('function summarizeAPIData('),app.indexOf('async function* streamOllama('))
import {summarizeWeather} from '../src/data/weatherContext.js'
import {reportWindowMessage} from '../src/data/regional/reportWindow.js'
const build=new Function('CFG','summarizeWeather','reportWindowMessage','uploadedDocumentContext',contextSource+';return buildContextRT')({state:'NY'},summarizeWeather,reportWindowMessage,uploadedDocumentContext)

test('production React context includes full upload with late passage without losing KB or live evidence',()=>{
 const result=build([doc],[{name:'fixture',success:true,data:{count:7},type:'other'}],['floodZones'],{floodZones:{label:'Flood Zones',source:'Fixture',data:'FULL_KB_SENTINEL'}},'Long Island')
 assert.ok(result.includes(doc.content))
 for(const fact of ['CEDAR-731','47 amber cones','DELTA-19','no incident commander is specified','FULL_KB_SENTINEL'])assert.ok(result.includes(fact))
 assert.match(result,/coverage: complete/)
 assert.ok(doc.content.indexOf('DELTA-19')>4000)
})

test('UTF-8 file boundaries, invalid encodings, extensions, duplicates and total limits',()=>{
 const exact={name:'boundary.txt',content:'🙂'.repeat(16384)}
 assert.equal(validateUploads([exact]),65536)
 assert.throws(()=>validateUploads([{...exact,content:exact.content+'a'}]),/64 KiB/)
 assert.equal(validateUploads([exact,{...exact,name:'other.md'}]),131072)
 assert.throws(()=>validateUploads([exact,{...exact,name:'other.md'},{name:'extra.txt',content:'x'}]),/128 KiB total/)
 assert.throws(()=>validateUploads([doc,doc]),/already attached/)
 assert.throws(()=>validateUploads(Array.from({length:9},(_,i)=>({name:`${i}.txt`,content:'a'}))),/8 documents/)
 assert.throws(()=>validateFileMetadata('wrong.pdf',5),/Unsupported file type/)
 assert.throws(()=>validateUploads([{name:'empty.txt',content:''}]),/empty/)
 assert.throws(()=>decodeUpload('broken.txt',new Uint8Array([0xff]).buffer),/not valid UTF-8/)
 assert.throws(()=>decodeUpload('binary.txt',new Uint8Array([0]).buffer),/binary/)
 assert.deepEqual(decodeUpload('bom.TXT',new Uint8Array([0xef,0xbb,0xbf,65]).buffer),{name:'bom.TXT',content:'A'})
})

test('combined messages are measured as UTF-8 bytes with a strict boundary and valid history',()=>{
 const messages=[{role:'system',content:'x'.repeat(98304)}]
 assert.equal(validateCloudMessages(messages),98304)
 assert.throws(()=>validateCloudMessages([...messages,{role:'user',content:'x'}]),/Nothing was sent to the model/)
 assert.throws(()=>validateCloudMessages([{role:'user',content:'🙂'.repeat(24577)}]),/96 KiB/)
 for(const bad of [[],[{}],[{role:'user',content:4}],Array(12).fill({role:'user',content:'a'})])assert.throws(()=>validateCloudMessages(bad))
})

test('actual Edge proxy forwards every document byte, preserves streaming, and rejects overflow before provider',async()=>{
 const original=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response('{"message":{"content":"recorded"},"done":true}\n')}
 try{
  const uploads=[doc],messages=[{role:'system',content:uploadedDocumentContext(uploads)},{role:'user',content:'Read the radio channel and commander.'}]
  const response=await handler(jsonRequest({messages,uploads}))
  assert.equal(response.status,200);assert.match(await response.text(),/recorded/)
  assert.deepEqual(calls[0].body.messages,messages)
  assert.equal(calls[0].body.options.num_predict,8192)
  assert.ok(calls[0].body.messages[0].content.includes('DELTA-19'))
  for(const body of [
   {messages:[{role:'user',content:'x'.repeat(98305)}]},
   {messages,uploads:[{name:'too-big.txt',content:'x'.repeat(65537)}]},
   {messages:[{role:'system',content:'only an excerpt'}],uploads},
  ]){
   const before=calls.length,res=await handler(jsonRequest(body))
   assert.ok([400,413].includes(res.status));assert.ok((await res.json()).error);assert.equal(calls.length,before)
  }
  const before=calls.length
  const res=await handler(jsonRequest({messages,ignored:'x'.repeat(1048576)}))
  assert.equal(res.status,413);assert.equal((await res.json()).code,'request_limit');assert.equal(calls.length,before)
  assert.equal((await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'x-ollama-key':'recording-only-key'},body:'not json'}))).status,400)
 }finally{globalThis.fetch=original}
})

test('JavaScript and Python policy, document rendering, boundary and error semantics agree',()=>{
 const cases=[[],[doc],[{name:'unicode.md',content:'🙂'.repeat(16384)}],[{name:'unicode.md',content:'🙂'.repeat(16384)+'a'}],[doc,doc],[{name:'bad.pdf',content:'abc'}],[{name:'empty.txt',content:''}]]
 const project=files=>{try{return {bytes:validateUploads(files),context:uploadedDocumentContext(files)}}catch(e){return {error:e.message,code:e.code,status:e.status}}}
 const expected={limits:UPLOAD_LIMITS,guidance:UPLOAD_GUIDANCE,cases:cases.map(project)}
 const actual=JSON.parse(execFileSync('python3',['tests/test_cloud_uploads.py','--projections'],{input:JSON.stringify(cases),encoding:'utf8'}))
 assert.deepEqual(actual,expected)
})
