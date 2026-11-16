// Checkpoint only: not wired into the live provider route. No free-prose channel.
import policy from '../../shared/location-synthesis-policy.json' assert {type:'json'}
import {buildOperationalEvidence} from './operationalEvidence.js'
import {escape} from './answerRecords.js'
import {interpretSourceFormats,sourceLines} from './sourceInterpretation.js'
export const SYNTHESIS_VERSION=policy.version
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const keys=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o).sort().join(','):''
const itemKeys='category,claim_id,interpretation,source_id,value'
const utf16=(text,start,end)=>text.slice(start,end)

// A deliberately finite natural-language grammar, independent of KB revision.
// Whole declarative lines only: no partial quotes from imperatives, conditions,
// negated/uncertain prose, JSON blocks or invented provider excerpts.
function assertions(text,target) {
 const out=[]
 for(const {line,start} of sourceLines(text)) {
  for(const relation of policy.relations.filter(r=>!r.adapter_only))for(const [verb,value] of [[' has ',true],[' does not have ',false]]) {
   const statement=target+verb+relation.noun+'.'
   if(line===statement)out.push({relation:relation.id,value,statement,start,end:start+line.length})
  }
 }
 return out
}
export function buildSynthesisCheckpoint(input) {
 const scope=structuredClone(input.scope),evidence=buildOperationalEvidence({...input,scope}),bundle=scope.evidence_bundle
 const selected=scope.selected_location,active=selected?.status==='selected',target=active?selected.location.display_name:null
 const claims=[],candidates=[],gaps=[]
 const add=(claim,category,interpretation,text,section)=>{
  claims.push(claim)
  candidates.push({proposal:{category,claim_id:claim.id,source_id:claim.source_id,interpretation,value:claim.value},text,section})
 }
 // Keep verified bounded identity, geometry/jurisdiction and measured/forecast
 // facts. Regional paragraphs and operational records are not narrative inputs.
 for(const record of evidence.records)if(active&&['location','jurisdiction','observation','latest_reported','forecast','coops'].includes(record.kind)) {
  const original=bundle.claims.find(c=>c.id===record.claim_id)
  if(!original)continue
  const category=['observation','latest_reported','forecast','coops'].includes(record.kind)?'weather_fact':'location_fact'
  add({id:record.claim_id,source_id:record.source_id,value:record.text,location:original.location,time:original.time,category},category,'report',record.text,'Facts')
 }
 if(active)for(const source of bundle.sources.filter(s=>['upload','enabled_context'].includes(s.kind))) {
  const raw=source.raw,text=source.kind==='upload'?(input.files||[])[raw.index]?.content:utf16(input.context||'',raw.start,raw.end)
  if(typeof text!=='string')continue
  // Uploaded copies stay uploads, never an enabled KB module impersonation.
  if(source.kind==='enabled_context'&&(input.files||[]).some(f=>f.content&&text.includes(f.content)))continue
  for(const row of assertions(text,target)) {
   const claim={id:'x'+claims.length,source_id:source.id,category:'source_assertion',relation:row.relation,value:row.value,target,location:{status:'source_named_target',basis:'Exact selected display name in source; identity and applicability are not independently verified.'},time:{disposition:'source_validity_unresolved'},excerpt:{...raw,start:(raw.start||0)+row.start,end:(raw.start||0)+row.end,offset_unit:'utf16',text:row.statement}}
   const attribution=source.kind==='upload'?source.source.name:source.source.name||source.source.id
   add(claim,'source_assertion','attribute',`${escape(attribution)} states: “${escape(row.statement)}” This is an attributed source assertion; current status and independent site applicability are unverified.`,'Source-supported context')
  }
 }
 const interpreted=interpretSourceFormats({...input,scope},bundle)
 for(const row of interpreted.rows) {
  const {description,attribution,...detail}=row
  add({id:'x'+claims.length,category:'source_assertion',target,...detail},'source_assertion','attribute',description,'Source-supported context')
 }
 gaps.push(...interpreted.gaps)
 const assertionsOnly=claims.filter(c=>c.category==='source_assertion')
 for(const relation of policy.relations) {
  const relationRows=assertionsOnly.filter(c=>c.relation===relation.id)
  for(const subject of new Set(relationRows.map(c=>c.subject||target))) {
   const rows=relationRows.filter(c=>(c.subject||target)===subject)
   if(new Set(rows.map(c=>c.value)).size>1) {
    gaps.push(`Supplied sources conflict about ${relation.noun} at ${escape(subject)}. Both assertions are retained; no precedence or current status is established.`)
    continue
   }
   if(rows.length) {
    const claim=rows[0]
    candidates.push({proposal:{category:'conditional_consideration',claim_id:claim.id,source_id:claim.source_id,interpretation:'verify_'+relation.id,value:claim.value},text:relation.check,section:'Conditional considerations'})
   }
  }
 }
 const weather=claims.find(c=>c.category==='weather_fact'&&['current_observation','latest_reported'].includes(c.time.disposition)&&bundle.claims.some(x=>x.source_id===c.source_id&&['windSpeed','windGust'].some(k=>typeof x.payload?.fields?.[k]?.value==='number'&&Number.isFinite(x.payload.fields[k].value))))
 // Match type metadata conservatively; a named station is not itself an airport.
 const type=active?selected.location.feature_type:null
 if(weather&&Object.hasOwn(policy.feature_checks,type))candidates.push({proposal:{category:'conditional_consideration',claim_id:weather.id,source_id:weather.source_id,interpretation:'feature_'+type,value:weather.value},text:policy.feature_checks[type],section:'Conditional considerations'})
 if(active&&!Object.hasOwn(policy.feature_checks,type))gaps.push('Feature type or relevant site context is unresolved; obtain site-linked descriptive evidence before assigning feature-specific considerations.')
 if(!active)gaps.push('Confirm the selected location before synthesizing site evidence.')
 for(const record of evidence.records.filter(r=>r.section==='Gaps'&&!r.kind.startsWith('kb_')))gaps.push(record.text)
 gaps.push('Only supported descriptive relations and bounded facts are represented. Other enabled source text remains available for review; missing extraction does not establish absence, safe conditions or normal operations.')
 if(!assertionsOnly.length&&!weather)gaps.push('Obtain a site-linked source describing relevant conditions and a valid observation or applicable forecast before assessing hazards. Location identity alone is insufficient.')
 return {version:SYNTHESIS_VERSION,scope,claims,candidates,gaps:[...new Set(gaps)],coverage:{location:active?'selected':'unresolved',weather:claims.some(c=>c.category==='weather_fact')?'bounded_facts_available':'unresolved',source_assertions:assertionsOnly.length,adapter_claims:interpreted.rows.length,unrepresented_source_text:true},operational:{route:'existing_source_scoped_validator_only',eligible_records:evidence.records.filter(r=>['threshold','procedure','gauge_linkage'].includes(r.kind))}}
}
export function synthesisInstruction(checkpoint) {
 return '\nSYNTHESIS CHECKPOINT CONTRACT: Return JSON with only version and statements. Version: '+SYNTHESIS_VERSION+'. Statements are exact proposal objects chosen from this request registry. Select source-supported facts and useful conditional considerations. No prose, additional values, local findings, operational directions or new references. References and interpretation compatibility are independently checked. Registry: '+JSON.stringify(checkpoint.candidates.map(c=>c.proposal))
}
export function renderSynthesisProposal(raw,checkpoint,complete=true) {
 const accepted=[],rejected=[];let format='valid',obj
 try {
  obj=JSON.parse(raw)
  if(!complete||keys(obj)!=='statements,version'||obj.version!==SYNTHESIS_VERSION||!Array.isArray(obj.statements)||obj.statements.length>32)throw Error()
 }catch {format='invalid_or_incomplete';obj={statements:[]}}
 for(const [index,item] of obj.statements.entries()) {
  const claim=checkpoint.claims.find(c=>c.id===item?.claim_id),source=checkpoint.scope.evidence_bundle.sources.find(s=>s.id===item?.source_id)
  const candidate=checkpoint.candidates.find(c=>keys(item)===itemKeys&&Object.keys(c.proposal).every(k=>Object.is(c.proposal[k],item[k])))
  if(!candidate||!claim||!source||claim.source_id!==source.id||!same(claim.value,item.value)) {rejected.push({index,reason:'unsupported_reference_value_category_or_interpretation'});continue}
  if(!accepted.includes(candidate))accepted.push(candidate)
 }
 // An unusable proposal cannot erase the verified facts or supported checks.
 const chosen=checkpoint.candidates.filter(c=>c.proposal.category!=='conditional_consideration'||accepted.includes(c))
 const useful=accepted.filter(c=>c.proposal.category==='conditional_consideration')
 const fallback=format!=='valid'||rejected.length>0||!useful.length
 if(fallback)for(const c of checkpoint.candidates.filter(c=>c.proposal.category==='conditional_consideration'))if(!chosen.includes(c))chosen.push(c)
 const lines=[]
 if(fallback)lines.push('Limited synthesis: unsupported or incomplete proposal content was withheld; supported facts and checks follow.','')
 for(const section of ['Facts','Source-supported context','Conditional considerations']) {
  const rows=chosen.filter(c=>c.section===section)
  if(rows.length)lines.push('## '+section,'',...rows.map(c=>'- '+c.text),'')
 }
 lines.push('## Material gaps','',...checkpoint.gaps.map(g=>'- '+g))
 const validation={format,claims:{accepted:accepted.length,rejected},evidence_coverage:checkpoint.coverage,response_completeness:fallback?'supported_fallback':'bounded_synthesis',operational_verification:'not_established'}
 return {answer:lines.join('\n').trim(),validation}
}
