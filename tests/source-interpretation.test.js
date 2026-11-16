import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import config from '../config/jurisdiction.generated.json' assert {type:'json'}
import {resolveRequestScope} from '../src/data/requestScope.js'
import {buildSynthesisCheckpoint,renderSynthesisProposal,SYNTHESIS_VERSION} from '../src/data/locationSynthesis.js'
const cases=JSON.parse(readFileSync(new URL('./fixtures/locations/source-adapters.json',import.meta.url)))
const project=x=>{const scope=resolveRequestScope(x),checkpoint=buildSynthesisCheckpoint({...x,scope}),proposal={version:SYNTHESIS_VERSION,statements:checkpoint.candidates.map(c=>c.proposal).slice(0,32)};return {checkpoint,proposal,rendered:renderSynthesisProposal(JSON.stringify(proposal),checkpoint)}}
const all=cases.map(project),get=name=>all[cases.findIndex(x=>x.name===name)]
const claims=(name,relation)=>get(name).checkpoint.claims.filter(c=>c.relation===relation)
test('KFRG consumes unchanged configured KB and recorded Suffolk geometry, without Nassau inventory expansion',()=>{
 const input=cases[0],p=get('kfrg-real-kb')
 assert.ok(input.context.includes(config.knowledge_base.resources));assert.ok(input.context.includes(config.knowledge_base.critical_infrastructure))
 assert.equal(claims(input.name,'coordination_contact').length,1)
 assert.equal(claims(input.name,'coordination_contact')[0].subject,'Suffolk OEM')
 assert.match(p.rendered.answer,/631-852-4900/);assert.match(p.rendered.answer,/4030 seconds old/)
 assert.doesNotMatch(p.rendered.answer,/Nassau OEM telephone|hospital section|mandatory evacuation ANY/)
 assert.match(p.rendered.answer,/incident-specific coordination/)
})
test('real hospital list supports interpretation without new sentence formats or current trauma designation',()=>{
 const p=get('hospital-real-kb')
 assert.equal(claims('hospital-real-kb','hospital_listing').length,1)
 assert.match(p.rendered.answer,/North Shore University Hospital in its Nassau hospital section/)
 assert.match(p.rendered.answer,/Confirm current facility capabilities/)
 assert.doesNotMatch(p.rendered.answer,/ACS \+ NYS|Level 1 Trauma|helipad availability|selected airport/)
 assert.equal(claims('hospital-edited-source','hospital_listing').length,1)
 assert.equal(claims('hospital-disabled-source','hospital_listing').length,0)
 assert.equal(claims('no-fuzzy-hospital-alias','hospital_listing').length,0)
 assert.match(get('hospital-pending-designation').rendered.answer,/dated or pending designation/)
 assert.ok(claims('hospital-pending-designation','hospital_listing')[0].qualifiers.includes('pending'))
})
test('missing, stale, future and mismatched county evidence cannot select a contact; crossings preserve both references',()=>{
 for(const name of ['kfrg-missing-boundaries','kfrg-stale-boundaries','kfrg-future-boundaries','kfrg-bad-fips'])assert.equal(claims(name,'coordination_contact').length,0,name)
 const p=get('crossing-county-reference');assert.deepEqual(claims('crossing-county-reference','coordination_contact').map(c=>c.subject),['Nassau OEM','Suffolk OEM'])
 assert.doesNotMatch(p.rendered.answer,/sources conflict about a coordination contact/)
 assert.ok(claims('crossing-county-reference','coordination_contact').every(c=>c.location.boundary.containment==='not_established'))
})
test('contact conflicts are source-specific, visible, unresolved and cannot pick an authority',()=>{
 const p=get('conflicting-contact-uploads');assert.match(p.rendered.answer,/631-852-4900/);assert.match(p.rendered.answer,/631-852-4901/)
 assert.match(p.rendered.answer,/sources conflict about a coordination contact at Suffolk OEM/)
 assert.ok(!p.checkpoint.candidates.some(c=>c.proposal.interpretation==='verify_coordination_contact'))
})
test('retained upload yields distinct inventory/deployed counts and preserves attribution without operational directions',()=>{
 const p=get('retained-upload-inventory'),content=readFileSync(new URL('../docs/long-island/acceptance/corrective-9862a66-2026-11-15/supplied-01/upload.txt',import.meta.url),'utf8')
 assert.equal(cases.find(x=>x.name==='retained-upload-inventory').files[0].content,content)
 assert.equal(claims('retained-upload-inventory','inventory_listing')[0].value,'47 amber cones')
 assert.equal(claims('retained-upload-inventory','deployment_listing')[0].value,'12 amber cones deployed at Gate A for this exercise; remaining 35 in storage')
 assert.match(p.rendered.answer,/Inventory and deployment are distinct/);assert.doesNotMatch(p.rendered.answer,/requires use DELTA-19|water_level >= 10|assumes exercise command/)
 assert.match(get('conflicting-inventory-uploads').rendered.answer,/conflict about an inventory listing/)
 assert.equal(claims('unlinked-upload','inventory_listing').length,0)
})
test('operational tails, fenced source listings and unsupported channels cannot bypass typed adapters',()=>{
 assert.equal(claims('operational-contact-tail','coordination_contact').length,0)
 assert.equal(claims('hospital-context-fence','hospital_listing').length,0)
 assert.equal(claims('operational-inventory-tail','inventory_listing').length,0)
 assert.equal(claims('operational-inventory-tail','deployment_listing').length,0)
 for(const p of all)for(const item of p.proposal.statements.filter(c=>c.category==='source_assertion')) {
  for(const interpretation of ['current_designation','nearest_hospital','mandatory_evacuation','wind_trigger_25_mph','radio_authorization','runway_open','flood_zone_AE']) {
   const out=renderSynthesisProposal(JSON.stringify({version:SYNTHESIS_VERSION,statements:[{...item,interpretation}]}),p.checkpoint)
   assert.equal(out.validation.claims.rejected.length,1)
  }
 }
})
test('uploaded KB remains an upload assertion; exact UTF-16 spans survive CRLF and emoji',()=>{
 const hospital=claims('hospital-upload-copy','hospital_listing')[0],source=get('hospital-upload-copy').checkpoint.scope.evidence_bundle.sources.find(s=>s.id===hospital.source_id)
 assert.equal(source.kind,'upload')
 cases.forEach((x,i)=>{for(const c of all[i].checkpoint.claims.filter(c=>c.excerpt)) {
  const e=c.excerpt,text=e.collection==='uploads'?x.files[e.index].content:x.context
  assert.equal(text.slice(e.start,e.end),e.text,x.name)
 }})
 assert.equal(claims('utf16-crlf-upload','inventory_listing').length,1)
})
test('complete JS/Python actual-source registries, provenance, proposal, visible answer and metadata agree',()=>{
 const python=JSON.parse(execFileSync('python3',['tests/test_source_interpretation.py','--project'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:24*1024*1024}))
 assert.deepEqual(all,python)
})
if(process.env.SOURCE_ADAPTER_CAPTURE_DIR) {
 const dir=process.env.SOURCE_ADAPTER_CAPTURE_DIR;mkdirSync(dir,{recursive:true})
 writeFileSync(dir+'/fixture-results.json',JSON.stringify(cases.map((input,i)=>({input,...all[i]})),null,2)+'\n')
 for(const name of ['kfrg-real-kb','hospital-real-kb','retained-upload-inventory'])writeFileSync(dir+'/'+name+'.md','# Frozen KB/upload replay with fixture weather and boundary timing; not current verification\n\n'+get(name).rendered.answer+'\n')
}

test('water, shelter, road and missing-geometry cases do not inherit regional zones, open status or route directions',()=>{
 assert.equal(claims('missing-geometry-with-boundaries','coordination_contact').length,0)
 for(const name of ['water-feature-no-zone-inference','shelter-no-open-status','road-no-route-inference']) {
  const p=get(name);assert.equal(p.checkpoint.coverage.source_assertions,0)
  assert.doesNotMatch(p.rendered.answer,/mandatory evacuation ANY|Nassau shelters:|FERRY ONLY|Zone AE \(Special Flood/)
  assert.ok(!p.checkpoint.candidates.some(c=>c.proposal.interpretation==='feature_airport'))
 }
})

test('fence length, fence character and CRLF rules apply equally to legacy assertions and new source adapters',()=>{
 const base=cases.find(x=>x.name==='hospital-real-kb'),name=base.selectedLocation.display_name
 for(const fence of ['~~~','````']) {
  const x=structuredClone(base);x.context='--- Local text ---\n'+fence+'text\n'+name+' has a helipad.\n```\nNassau Level 2: '+name+'.\n'+fence+'\n'
  // A shorter or different fence does not close the original block.
  assert.equal(project(x).checkpoint.coverage.source_assertions,0)
 }
})

test('county reference freshness boundary is explicit and source identity/geometry relationship must match',()=>{
 const base=cases[0]
 for(const [age,expected] of [[3600,1],[3601,0]]) {
  const x=structuredClone(base);x.localJurisdiction.levels[0].fetched_at=new Date(Date.parse(x.requestedAt)-age*1000).toISOString()
  assert.equal(project(x).checkpoint.claims.filter(c=>c.relation==='coordination_contact').length,expected)
 }
 for(const change of [j=>j.geometry_reference='centroid',j=>j.relation='within',j=>j.levels[0].source_url='https://example.invalid/2/query',j=>j.levels[0].status='unavailable']) {
  const x=structuredClone(base);change(x.localJurisdiction)
  assert.equal(project(x).checkpoint.claims.filter(c=>c.relation==='coordination_contact').length,0)
 }
})
