import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolveRequestScope} from '../src/data/requestScope.js'
import {buildSynthesisCheckpoint,renderSynthesisProposal,synthesisInstruction,SYNTHESIS_VERSION} from '../src/data/locationSynthesis.js'
const cases=JSON.parse(readFileSync(new URL('./fixtures/locations/synthesis-checkpoint.json',import.meta.url)))
function project(x) {
 const scope=resolveRequestScope(x),checkpoint=buildSynthesisCheckpoint({...x,scope})
 const proposal={version:SYNTHESIS_VERSION,statements:checkpoint.candidates.map(c=>c.proposal)}
 const bad={category:'conditional_consideration',claim_id:'invented',source_id:'s0',interpretation:'mandatory_evacuation',value:'25 mph'}
 return {checkpoint,proposal,instruction:synthesisInstruction(checkpoint),rendered:renderSynthesisProposal(JSON.stringify(proposal),checkpoint),rejected:renderSynthesisProposal(JSON.stringify({...proposal,statements:[bad,...proposal.statements]}),checkpoint),incomplete:renderSynthesisProposal('',checkpoint,false)}
}
const all=cases.map(project),get=name=>all[cases.findIndex(x=>x.name===name)]
test('KFRG preserves aged weather and interprets attributed source facts without runway/aircraft findings',()=>{
 const p=get('kfrg-supported'),a=p.rendered.answer
 assert.match(a,/4030 seconds old/);assert.match(a,/gusts 33.34 km\/h/);assert.match(a,/wind direction/)
 assert.match(a,/helipad availability/);assert.match(a,/backup-power readiness/);assert.match(a,/verify runway conditions/)
 assert.equal(p.rendered.validation.response_completeness,'bounded_synthesis')
 assert.equal(p.rendered.validation.operational_verification,'not_established')
})
test('edited hospital KB has useful patient-access and receiving checks beyond fixed module revisions',()=>{
 const p=get('hospital-edited-kb'),a=p.rendered.answer
 assert.match(a,/an emergency department/);assert.match(a,/receiving capability/);assert.match(a,/access redundancy/)
 assert.match(a,/selected hospital/);assert.doesNotMatch(a,/runway|Regional KB context|no reviewed contextual records/)
 assert.equal(p.checkpoint.coverage.source_assertions,2)
 assert.equal(get('hospital-disabled-kb').checkpoint.coverage.source_assertions,0)
})
test('conflicting source assertions remain visible and unresolved; no merged readiness inference',()=>{
 const p=get('hospital-conflicting-uploads');assert.match(p.rendered.answer,/has backup power/);assert.match(p.rendered.answer,/does not have backup power/);assert.match(p.rendered.answer,/conflict about backup power/)
 assert.ok(!p.checkpoint.candidates.some(c=>c.proposal.interpretation==='verify_backup_power'))
})
test('cited operational text, partial sentences, conditional/quoted fragments and other sites cannot become source facts',()=>{
 const p=get('hospital-malicious-source');assert.equal(p.checkpoint.coverage.source_assertions,0)
 assert.doesNotMatch(p.rendered.answer,/25 mph|TAC-7|has a helipad|has backup power/)
})
test('well-formed plausible unsupported local claims, cross-source IDs, altered values and categories are rejected individually',()=>{
 for(const name of ['kfrg-supported','hospital-edited-kb']) {
  const p=get(name),cp=p.checkpoint,known=p.proposal.statements.find(c=>c.category==='source_assertion')
  const attacks=[
   {...known,value:!known.value},{...known,value:1},{...known,source_id:'s999'},
   {...known,category:'current_site_fact'},{...known,interpretation:'nearest_hospital'},
   {...known,interpretation:'radio_authorization'}, {...known,interpretation:'runway_open'},
   {...known,interpretation:'mandatory_evacuation'}, {...known,interpretation:'wind_trigger_25_mph'},
   {...known,interpretation:'flood_zone_AE'}, {...known,interpretation:'assign_commander'},
   {...known,interpretation:'shelter_open'}, {...known,interpretation:'equipment_stable'},
   {...known,interpretation:'mutual_aid'}, {...known,interpretation:'transport_route'},
   {...known,current:true}, {...known,text:'Evacuate now.'}, null, 'a0'
  ]
  const out=renderSynthesisProposal(JSON.stringify({version:SYNTHESIS_VERSION,statements:attacks}),cp)
  assert.equal(out.validation.format,'valid');assert.equal(out.validation.claims.rejected.length,attacks.length)
  assert.equal(out.validation.response_completeness,'supported_fallback');assert.match(out.answer,/Source-supported context/)
  assert.doesNotMatch(out.answer,/Evacuate now|wind_trigger|runway_open/)
  const swapped=renderSynthesisProposal(JSON.stringify({version:SYNTHESIS_VERSION,statements:[{...known,source_id:cp.claims.find(c=>c.source_id!==known.source_id).source_id}]}),cp)
  assert.equal(swapped.validation.claims.rejected.length,1)
 }
})
test('truncated, malformed, old-envelope and empty proposals preserve useful facts and checks with separate validation metadata',()=>{
 const p=get('kfrg-supported')
 for(const raw of ['',JSON.stringify({version:'operational-answer-v2',records:[]}),JSON.stringify({version:SYNTHESIS_VERSION,statements:[]})]) {
  const out=renderSynthesisProposal(raw,p.checkpoint)
  assert.match(out.answer,/4030 seconds old/);assert.match(out.answer,/helipad availability/)
  assert.equal(out.validation.response_completeness,'supported_fallback')
 }
 assert.equal(renderSynthesisProposal(JSON.stringify(p.proposal),p.checkpoint,false).validation.format,'invalid_or_incomplete')
})
test('unknown features receive no airport fallback; road geometry, missing data and ambiguity retain limited evidence',()=>{
 assert.doesNotMatch(get('unknown-feature-type').rendered.answer,/selected airport|runway/)
 assert.deepEqual(get('road-full-geometry').checkpoint.scope.selected_location.location.geometry,cases.find(x=>x.name==='road-full-geometry').selectedLocation.geometry)
 assert.match(get('hospital-missing-weather').rendered.answer,/receiving capability/)
 assert.equal(get('expired-weather').checkpoint.coverage.weather,'unresolved')
 assert.equal(get('ambiguous-selection').checkpoint.candidates.length,0)
 assert.match(get('sparse-identity-only').rendered.answer,/Obtain a site-linked source/)
 assert.doesNotMatch(get('unrelated-revised-kb').rendered.answer,/Nassau shelters|Flooding — regional KB|OEM 516/)
})
test('source excerpts resolve to exact full retained source spans, including UTF-16 context offsets',()=>{
 cases.forEach((x,i)=>{for(const c of all[i].checkpoint.claims.filter(c=>c.category==='source_assertion')) {
  const e=c.excerpt,body=e.collection==='uploads'?x.files[e.index].content:x.context
  assert.equal(body.slice(e.start,e.end),e.text)
 }})
})
test('complete JS/Python checkpoint, prompt, accepted/rejected output and fallback agree',()=>{
 const py=JSON.parse(execFileSync('python3',['tests/test_location_synthesis.py','--project'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:20*1024*1024}))
 assert.deepEqual(all,py)
})
if(process.env.SYNTHESIS_CAPTURE_DIR) {
 mkdirSync(process.env.SYNTHESIS_CAPTURE_DIR,{recursive:true})
 writeFileSync(process.env.SYNTHESIS_CAPTURE_DIR+'/fixture-results.json',JSON.stringify(cases.map((x,i)=>({input:x,...all[i]})),null,2)+'\n')
 for(const name of ['kfrg-supported','hospital-edited-kb','hospital-conflicting-uploads'])writeFileSync(process.env.SYNTHESIS_CAPTURE_DIR+'/'+name+'.md','# Local synthetic fixture replay\n\n'+get(name).rendered.answer+'\n')
}

test('existing source-scoped operational evidence remains separate from the synthesis channel',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/corrective/regressions.json',import.meta.url)))
 const scope={status:'resolved',method:'source_period',timezone:'America/New_York',request_utc:fixture.request_utc,interval:fixture.interval}
 const input={scope,files:[{name:'positive-plan.md',content:readFileSync(new URL('./fixtures/corrective/positive-plan.md',import.meta.url),'utf8')}],question:'CEDAR-731 cones, commander, deployment, threshold and authorized radio procedure tonight'}
 const cp=buildSynthesisCheckpoint(input)
 assert.ok(cp.operational.eligible_records.some(r=>r.kind==='threshold'));assert.ok(cp.operational.eligible_records.some(r=>r.kind==='procedure'))
 const attempt={version:SYNTHESIS_VERSION,statements:[{category:'conditional_consideration',claim_id:cp.operational.eligible_records.find(r=>r.kind==='procedure').claim_id,source_id:cp.operational.eligible_records.find(r=>r.kind==='procedure').source_id,interpretation:'use_DELTA_19',value:'authorized'}]}
 const out=renderSynthesisProposal(JSON.stringify(attempt),cp)
 assert.equal(out.validation.claims.rejected.length,1);assert.doesNotMatch(out.answer,/requires use DELTA-19/)
})

test('temperature-only source cannot supply a wind-based feature consideration; station name alone cannot supply a feature type',()=>{
 const x=structuredClone(cases[0]);for(const w of x.weather)for(const key of ['windSpeed','windGust','windDirection'])delete w.data.properties[key]
 const cp=buildSynthesisCheckpoint({...x,scope:resolveRequestScope(x)})
 assert.ok(!cp.candidates.some(c=>c.proposal.interpretation==='feature_airport'))
 const named=structuredClone(cases[0]);named.selectedLocation.feature_type=null;named.selectedLocation.unknowns=['local_jurisdiction','facility_footprint',...['source_id','feature_id','source_url','feature_type','geometry','observed_at','fetched_at','station_id'].filter(k=>named.selectedLocation[k]===null)]
 const cp2=buildSynthesisCheckpoint({...named,scope:resolveRequestScope(named)})
 assert.ok(!cp2.candidates.some(c=>c.proposal.interpretation==='feature_airport'))
})
