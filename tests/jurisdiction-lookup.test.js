import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {lookupJurisdiction,boundaryQuery,normalizeBoundaryResponse,JURISDICTION_LOOKUP_POLICY as policy} from '../src/data/jurisdictionLookup.js'
import {selectedLocationFromFeature,selectedLocationQuestion} from '../src/data/selectedLocation.js'
import {scopedCloudMessagesWithJurisdiction} from '../src/data/cloudRequestScope.js'
import handler from '../api/chat.js'
import {renderOperationalAnswer} from '../src/data/operationalEvidence.js'
const now='2026-11-15T20:00:00.000Z',clock=()=>now
const fixtures=Object.fromEntries(policy.layers.map(l=>[l.layer_id,JSON.parse(readFileSync(new URL(`./fixtures/jurisdiction/kfrg-${l.layer_id}.json`,import.meta.url)))]))
const kfrg=()=>selectedLocationFromFeature({name:'KFRG — Republic Airport',station_id:'KFRG',geometry:{type:'Point',coordinates:[-73.4134,40.7288]}})
const response=raw=>new Response(JSON.stringify(raw),{headers:{'content-type':'application/json'}})
const fixtureFetch=async url=>response(fixtures[url.split('/').at(-2)])
const body=(location,q=selectedLocationQuestion(location))=>({messages:[{role:'system',content:'Fixture KB'},{role:'user',content:q}],scope_input:{version:'request-scope-v1',weather:[],selected_location:location}})

test('KFRG gets source-attributed Suffolk/Babylon intersections through server answer assembly',async()=>{
 const v=kfrg(),out=await scopedCloudMessagesWithJurisdiction(body(v),now,{fetchImpl:fixtureFetch,clock})
 const j=out.scope.selected_location.local_jurisdiction
 assert.equal(j.status,'matched');assert.deepEqual(j.names,['County: Suffolk','Town: Babylon']);assert.equal(j.containment,'not_evaluated')
 assert.equal(j.levels[2].status,'no_match');assert.equal(j.levels[0].matches[0].source_modified_at,null)
 const a=renderOperationalAnswer(JSON.stringify({version:out.evidence.version,records:[]}),out.evidence,out.scope).answer
 assert.match(a,/County: Suffolk; Town: Babylon/);assert.match(a,/Supplied map geometry intersects/);assert.match(a,/emergency authority are not established/)
 assert.equal(out.scope.selected_location.application_jurisdiction,'Long Island')
 assert.ok(out.messages[0].content.includes('raw_response'))
})
test('full shapes and polygon holes are sent in fixed POST spatial queries without a centroid or client URL',async()=>{
 const shapes=JSON.parse(readFileSync(new URL('./fixtures/locations/selected-locations.json',import.meta.url))).filter(f=>f.geometry).map(f=>f.geometry)
 shapes.push({type:'MultiPoint',coordinates:[[-73,40],[-72,41]]},{type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,0]],[[1,1],[2,2],[2,1],[1,1]]]})
 for(const geometry of shapes) {
  const v=selectedLocationFromFeature({name:'Arbitrary same name',geometry,source_url:'https://untrusted.invalid/source'}),calls=[]
  await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async(url,o)=>{calls.push({url,o});return fixtureFetch(url)}})
  assert.equal(calls.length,3)
  for(const {url,o} of calls) {
   assert.ok(url.startsWith(policy.service_root));assert.equal(o.method,'POST');assert.equal(o.redirect,'manual')
   const p=new URLSearchParams(o.body);assert.equal(p.get('spatialRel'),'esriSpatialRelIntersects');assert.equal(p.get('inSR'),'4326');assert.equal(p.get('where'),'1=1')
   const g=JSON.parse(p.get('geometry'))
   if(geometry.type==='LineString')assert.deepEqual(g.paths,[geometry.coordinates])
   if(geometry.type==='MultiLineString')assert.deepEqual(g.paths,geometry.coordinates)
   if(geometry.type.includes('Polygon'))assert.equal(g.rings.length,geometry.type==='Polygon'?geometry.coordinates.length:geometry.coordinates.flat().length)
   assert.ok(!o.body.includes('untrusted.invalid'))
  }
 }
})
test('multiple county/town matches stay multiple; failed or truncated results never select one',async()=>{
 const v=kfrg()
 const multi=structuredClone(fixtures[2]);multi.features.push({attributes:{OBJECTID:31,NAME:'Nassau',FIPS_CODE:'36059',DATEMOD:null}})
 const j=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async url=>response(url.includes('/2/')?multi:fixtures[url.split('/').at(-2)])})
 assert.equal(j.status,'multiple');assert.deepEqual(j.names,['County: Nassau','County: Suffolk','Town: Babylon'])
 for(const bad of [{features:[],exceededTransferLimit:true},{error:{message:'unavailable'}},{features:[{attributes:{NAME:'fake'}}]}]) {
  const partial=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async url=>response(url.includes('/2/')?bad:fixtures[url.split('/').at(-2)])})
  assert.equal(partial.status,'partial');assert.ok(!partial.names.some(n=>n.startsWith('County:')));assert.equal(partial.levels[0].status,'unavailable')
 }
})
test('no geometry, ambiguous name or changed question causes no boundary-service fetch',async()=>{
 for(const [v,q] of [[selectedLocationFromFeature({name:'Springfield'}),null],[kfrg(),'Current conditions at KJFK?']]) {
  const j=await lookupJurisdiction(v,q||selectedLocationQuestion(v),{fetchImpl:()=>{throw Error('must not fetch')}})
  assert.equal(j.status,'unresolved');assert.deepEqual(j.names,[])
 }
 let calls=0
 const out=await scopedCloudMessagesWithJurisdiction(body(kfrg(),'Current conditions at KJFK?'),now,{fetchImpl:()=>{calls++;throw Error()}})
 assert.equal(calls,0);assert.equal(out.scope.status,'clarify')
})
test('client administrative claims cannot become server lookup facts; invalid requests make no egress',async()=>{
 const b=body(kfrg());b.scope_input.local_jurisdiction={status:'matched',names:['County: invented']}
 const out=await scopedCloudMessagesWithJurisdiction(b,now,{fetchImpl:fixtureFetch,clock})
 assert.deepEqual(out.scope.selected_location.local_jurisdiction.names,['County: Suffolk','Town: Babylon'])
 let calls=0;b.scope_input.selected_location.geometry.coordinates=[999,40]
 await assert.rejects(scopedCloudMessagesWithJurisdiction(b,now,{fetchImpl:()=>{calls++}}));assert.equal(calls,0)
})
test('bounded HTTP failure, redirect and oversized replies preserve unknowns',async()=>{
 for(const fetchImpl of [async()=>new Response('bad',{status:503}),async()=>{throw Error('redirect')},async()=>new Response('x'.repeat(policy.max_response_bytes+1))]) {
  const v=kfrg(),j=await lookupJurisdiction(v,selectedLocationQuestion(v),{fetchImpl,clock})
  assert.equal(j.status,'unresolved');assert.deepEqual(j.names,[]);assert.ok(j.levels.every(l=>l.status==='unavailable'))
 }
})
test('JS/Python agree on request geometry, source normalization, scope and substantive answer records',async()=>{
 const v=kfrg(),out=await scopedCloudMessagesWithJurisdiction(body(v),now,{fetchImpl:fixtureFetch,clock})
 const shapes=JSON.parse(readFileSync(new URL('./fixtures/locations/selected-locations.json',import.meta.url))).filter(f=>f.geometry).map(f=>f.geometry)
 shapes.push({type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,0]],[[1,1],[2,2],[2,1],[1,1]]]})
 const queries=shapes.flatMap(g=>policy.layers.map(l=>boundaryQuery(g,l)))
 const script=`import sys,json;sys.path.insert(0,'streamlit')
from jurisdiction_lookup import lookup_jurisdiction,boundary_query,POLICY
from request_scope import resolve_request_scope
from operational_evidence import build_operational_evidence
from selected_location import selected_location_question
x=json.load(sys.stdin);v=x['location'];q=selected_location_question(v)
j=lookup_jurisdiction(v,q,fetch_layer=lambda url,params:x['fixtures'][url.split('/')[-2]],clock=lambda:x['now'])
s=resolve_request_scope(q,x['now'],x['jurisdiction'],selected_location=v,local_jurisdiction=j)
e=build_operational_evidence(s,question=q,context='Fixture KB')
print(json.dumps(dict(j=j,queries=[boundary_query(g,l) for g in x['shapes'] for l in POLICY['layers']],records=e['records'])))`
 const py=JSON.parse(execFileSync('python3',['-c',script],{encoding:'utf8',input:JSON.stringify({location:v,now,jurisdiction:{name:'Long Island',timezone:'America/New_York',center:[40.7891,-73.135]},fixtures,shapes})}))
 assert.deepEqual(out.scope.selected_location.local_jurisdiction,py.j)
 assert.deepEqual(queries.map(q=>({...q,geometry:JSON.parse(q.geometry)})),py.queries.map(q=>({...q,geometry:JSON.parse(q.geometry)})))
 assert.deepEqual(out.evidence.records,py.records)
})

test('actual Edge handler performs fixed-source lookups and retains them in the streamed answer',async()=>{
 const original=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{
  calls.push(url)
  if(url.startsWith(policy.service_root))return fixtureFetch(url)
  assert.equal(url,'https://ollama.com/api/chat')
  const raw=JSON.stringify({version:'operational-answer-v2',records:[]})
  return new Response(JSON.stringify({message:{content:raw},done:true,done_reason:'stop'})+'\n')
 }
 try {
  const result=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body(kfrg()))}))
  assert.equal(result.status,200)
  const frames=(await result.text()).trim().split('\n').map(JSON.parse)
  assert.deepEqual(frames.find(f=>f.ember_scope).ember_scope.selected_location.local_jurisdiction.names,['County: Suffolk','Town: Babylon'])
  assert.ok(frames.some(f=>f.message?.content.includes('County: Suffolk; Town: Babylon')))
  assert.equal(calls.length,4)
 }finally {globalThis.fetch=original}
})

test('real NYS village composite identifier is retained independently of county/town codes',()=>{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/jurisdiction/crossing-villages.json',import.meta.url)))
 const row=normalizeBoundaryResponse(raw,policy.layers[2],now).matches[0]
 assert.equal(row.name,'Farmingdale');assert.equal(row.fips,'360595600025384');assert.equal(row.county,'Nassau');assert.equal(row.town,'Oyster Bay')
})

test('lookup works when runtime permits manual redirect handling but rejects redirect:error',async()=>{
 const v=kfrg(),calls=[]
 const result=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async(url,options)=>{
  calls.push(options.redirect)
  if(options.redirect==='error')throw new TypeError('Unsupported redirect mode: error')
  assert.equal(options.redirect,'manual')
  return fixtureFetch(url)
 }})
 assert.deepEqual(result.names,['County: Suffolk','Town: Babylon'])
 assert.deepEqual(calls,['manual','manual','manual'])
})
test('manual redirects are rejected without following any returned location',async()=>{
 const v=kfrg(),urls=[]
 const result=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async url=>{urls.push(url);return new Response(null,{status:302,headers:{location:'https://untrusted.invalid/redirect'}})}})
 assert.equal(urls.length,3);assert.ok(urls.every(url=>url.startsWith(policy.service_root)))
 assert.ok(result.levels.every(l=>l.status==='unavailable'&&l.reason==='boundary_redirect_rejected'))
})
test('failure diagnostics distinguish network and decoding failures without serializing error text',async()=>{
 const v=kfrg(),diagnostics=[]
 const error=new TypeError('fetch failed; secret-test-marker');error.cause={code:'ECONNRESET',message:'secret-test-marker'}
 const failed=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,onFailure:d=>diagnostics.push(d),fetchImpl:async()=>{throw error}})
 assert.ok(failed.levels.every(l=>l.failure_stage==='fetch'&&l.failure_code==='ECONNRESET'&&l.error_type==='TypeError'))
 assert.equal(diagnostics.length,3);assert.ok(!JSON.stringify({failed,diagnostics}).includes('secret-test-marker'))
 const invalid=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async()=>new Response('not JSON')})
 assert.ok(invalid.levels.every(l=>l.failure_stage==='decode'&&l.reason==='boundary_invalid_json'))
})
test('a fully read successful response does not require cancelling its completed stream',async()=>{
 const v=kfrg()
 const result=await lookupJurisdiction(v,selectedLocationQuestion(v),{clock,fetchImpl:async url=>{
  const data=new TextEncoder().encode(JSON.stringify(fixtures[url.split('/').at(-2)]));let delivered=false
  return {ok:true,status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>delivered?{done:true}:(delivered=true,{done:false,value:data}),cancel:()=>{throw Error('completed stream cannot be cancelled')},releaseLock:()=>{}})}}
 }})
 assert.deepEqual(result.names,['County: Suffolk','Town: Babylon'])
})

test('Brentwood shelter survives the full Edge handler without inferring open shelter status or command authority',async()=>{
 const original=globalThis.fetch
 const source=selectedLocationFromFeature({name:'Brentwood HS',source_name:'Evac Shelters',description:'Evacuation Center | central Suffolk',geometry:{type:'Point',coordinates:[-73.246,40.7776]}})
 globalThis.fetch=async(url,options)=>{
  if(url.startsWith(policy.service_root)) {
   if(options.redirect!=='manual')throw new TypeError('Unsupported redirect mode: error')
   const id=url.split('/').at(-2)
   return new Response(readFileSync(new URL(`./fixtures/jurisdiction/brentwood-${id}.json`,import.meta.url)))
  }
  assert.equal(url,'https://ollama.com/api/chat')
  return new Response(JSON.stringify({message:{content:JSON.stringify({version:'operational-answer-v2',records:[]})},done:true,done_reason:'stop'})+'\n')
 }
 try {
  const result=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-ollama-key':'recording-only'},body:JSON.stringify(body(source))}))
  assert.equal(result.status,200)
  const frames=(await result.text()).trim().split('\n').map(JSON.parse)
  const selected=frames.find(f=>f.ember_scope).ember_scope.selected_location
  assert.equal(selected.location.display_name,'Brentwood HS')
  assert.deepEqual(selected.local_jurisdiction.names,['County: Suffolk','Town: Islip'])
  const answer=frames.filter(f=>f.message).map(f=>f.message.content).join('')
  assert.match(answer,/County: Suffolk; Town: Islip/)
  assert.match(answer,/facility ownership and emergency authority are not established/)
  assert.ok(!/shelter is (?:open|available)|shelter capacity is|assigned commander/i.test(answer))
 }finally {globalThis.fetch=original}
})
