import kbCatalog from '../../shared/kb-context-records.json' assert {type:'json'}
import {scopedWeather} from './requestScope.js'
import {selectCoops} from './coopsEvidence.js'
// IDs are request-local, deterministic references, never cross-request identities.
// Full source text remains in the original context/uploads; spans index it exactly.
export function buildLocationEvidenceBundle({scope,weather=[],coops=[],files=[],context=''}) {
 const sources=[],claims=[],gaps=[]
 const add=(kind,source,location,time,payload,raw)=>{const id='s'+sources.length;sources.push({id,kind,source,location,time,raw});if(payload!==null)claims.push({id:'c'+claims.length,source_id:id,location,time,payload});return id}
 for(const [index,s] of scopedWeather(weather,scope).entries()) {
  const location=s.location_relationship||{status:'unknown',basis:s.coverage},obs=s.latest_reported||s.observation
  const time={request_utc:scope.request_utc,fetched_at:s.fetched_at,observed_at:obs?.timestamp||null,selected_interval:s.selected_interval||null,disposition:s.latest_reported?'latest_reported':s.observation&&Object.keys(s.observation.fields).length?'current_observation':s.granularity||s.state}
  const payload=s.latest_reported||s.observation&&Object.keys(s.observation.fields).length?obs:s.periods.length||Object.keys(s.series).length?{periods:s.periods,series:s.series}:null
  add('weather',{id:s.id,url:s.url,provenance:'client_snapshot'},location,time,payload,{collection:'weather',index})
  if(payload===null||s.coverage!=='complete')gaps.push({source_id:sources.at(-1).id,reason:s.coverage,state:s.state})
 }
 for(const [index,s] of selectCoops(coops,scope,'').entries())add('coops',{id:s.id,url:s.url,provenance:'client_snapshot'},{status:'reference_only',basis:'Gauge/site linkage requires separately validated source evidence.'},{request_utc:scope.request_utc,disposition:s.state},s.events.length||s.background.length?s:null,{collection:'coops',index})
 for(const [index,f] of files.entries())add('upload',{name:f.name,provenance:'uploaded_source_assertion'},{status:'unresolved',basis:'Document site applicability requires claim review.'},{request_utc:scope.request_utc,disposition:'source_validity_unresolved'},null,{collection:'uploads',index})
 // Preserve every enabled context section, including alerts and loaded-layer data.
 // No structured coverage means unresolved, never a zero-hazard claim.
 const re=/^--- .*$/gm,starts=[...context.matchAll(re)].map(m=>m.index);if(!starts.length||starts[0]!==0)starts.unshift(0)
 for(let i=0;i<starts.length;i++) {const start=starts[i],end=starts[i+1]??context.length,text=context.slice(start,end);if(!text.trim())continue
  add('enabled_context',{id:kbCatalog.modules.find(m=>text.startsWith('--- '+m.header+' ---\n'))?.module||null,name:text.split('\n')[0],provenance:'source_assertion'},{status:'unresolved',basis:'Regional KB, alerts and loaded layers require source-specific geometry/coverage review.'},{request_utc:scope.request_utc,disposition:'source_validity_unresolved'},null,{collection:'context',start,end,offset_unit:'utf16'})
 }
 gaps.push({source_id:null,reason:'Unresolved source applicability or missing evidence does not establish no hazard, no outage or normal operations.'})
 return {version:'location-evidence-bundle-v1',selected_location:scope.selected_location||null,sources,claims,gaps,raw_sources:{weather,coops}}
}

// Bind every bounded usable answer record to its source and relationship. These
// bindings describe provenance; they do not upgrade regional/source assertions
// into site facts or approve a later synthesis proposal.
export function linkAnswerClaims(bundle,evidence) {
 for(const record of evidence.records.filter(r=>['Facts','Regional KB context'].includes(r.section))) {
  const matches=bundle.sources.filter(s=>s.kind!=='answer_derivation'&&(s.source.id===record.source||s.source.name===record.source))
  let source=matches.length===1?matches[0]:null
  if(!source) {
   source={id:'s'+bundle.sources.length,kind:'answer_derivation',source:{id:record.source,provenance:'bounded_application_record'},location:{status:'unresolved',basis:'Answer record provenance does not establish site applicability.'},time:{disposition:'source_validity_unresolved'},raw:{collection:'answer_records',id:record.id}}
   bundle.sources.push(source)
  }
  const claim={id:'c'+bundle.claims.length,source_id:source.id,location:source.location,time:source.time,payload:{record_id:record.id,kind:record.kind,text:record.text}}
  bundle.claims.push(claim);record.claim_id=claim.id;record.source_id=source.id
 }
 return evidence
}
