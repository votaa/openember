// Source-format adapters. Claims are attributed listings, never live status or authority.
import boundaryPolicy from '../../shared/jurisdiction-lookup-policy.json' assert {type:'json'}
import {instant} from './requestScope.js'
import synthesisPolicy from '../../shared/location-synthesis-policy.json' assert {type:'json'}
import {escape,documentValue} from './answerRecords.js'
import {documentEvidence} from './evidenceSummary.js'
const countyFips={Nassau:'36059',Suffolk:'36103'}
export function countyReferences(scope) {
 const selected=scope.selected_location,local=selected?.local_jurisdiction
 if(selected?.status!=='selected'||!selected.location.geometry||local?.version!==boundaryPolicy.version||local.relation!=='intersects'||local.geometry_reference!=='selected_location.location.geometry')return []
 const layer=local.levels?.find(l=>l.level==='county'),age=instant(scope.request_utc)-instant(layer?.fetched_at)
 if(!layer||layer.layer_id!==2||layer.source_url!==boundaryPolicy.service_root+'/2/query'||!['matched','multiple'].includes(layer.status)||!Number.isFinite(age)||age< -synthesisPolicy.boundary_future_tolerance_seconds*1000||age>3600000)return []
 return (layer.matches||[]).filter(m=>m.kind==='County'&&Object.hasOwn(countyFips,m.name)&&countyFips[m.name]===m.fips).map(m=>({name:m.name,fips:m.fips,source_url:layer.source_url,fetched_at:layer.fetched_at,relation:'intersects',containment:'not_established'}))
}
export function sourceLines(text) {
 const out=[];let offset=0,fence=null
 for(const line of text.split('\n')) {
  const mark=/^\s*(`{3,}|~{3,})(.*)$/.exec(line)
  if(mark) {
   if(fence===null)fence={char:mark[1][0],length:mark[1].length}
   else if(fence.char===mark[1][0]&&mark[1].length>=fence.length&&!mark[2].trim())fence=null
  }
  else if(fence===null)out.push({line:line.replace(/\r$/,''),start:offset})
  offset+=line.length+1
 }
 return out
}
const sourceText=(s,input)=>s.kind==='upload'?(input.files||[])[s.raw.index]?.content:(input.context||'').slice(s.raw.start,s.raw.end)
const excerpt=(source,text,start,end)=>({...source.raw,start:(source.raw.start||0)+start,end:(source.raw.start||0)+end,offset_unit:'utf16',text:text.slice(start,end)})
export function interpretSourceFormats(input,bundle) {
 const selected=input.scope.selected_location
 if(selected?.status!=='selected')return {rows:[],gaps:[]}
 const target=selected.location.display_name,counties=countyReferences(input.scope),rows=[],gaps=[]
 for(const source of bundle.sources.filter(s=>['upload','enabled_context'].includes(s.kind))) {
  const text=sourceText(source,input);if(typeof text!=='string')continue
  if(source.kind==='enabled_context'&&(input.files||[]).some(f=>f.content&&text.includes(f.content)))continue
  const attribution=source.kind==='upload'?source.source.name:source.source.name||source.source.id
  const add=(row,start,end)=>rows.push({...row,source_id:source.id,time:{disposition:'source_validity_unresolved'},excerpt:excerpt(source,text,start,end),attribution})
  for(const {line,start} of sourceLines(text)) {
   // Parse entries, not the trauma/designation heading as a verified capability.
   const hospital=/^(?:Hospitals — )?(Nassau|Suffolk) Level (?:[123](?: Trauma \(\d+\))?|3 \/ East End): (.+)$/.exec(line)
   if(hospital) {
    let entryStart=line.indexOf(': ')+2
    for(const part of hospital[2].split(';')) {
     const trimmed=part.trim(),name=trimmed.replace(/\.$/,'').replace(/ \([^()]*\)$/,'')
     if(name.toLowerCase()===target.toLowerCase()) {
      const begin=start+entryStart+part.indexOf(trimmed)
      add({relation:'hospital_listing',subject:target,value:true,description:`${escape(attribution)} lists ${escape(target)} in its ${hospital[1]} hospital section. The listing does not verify current designation, receiving capacity or access.`,location:{status:'source_named_target',basis:'Exact hospital entry name matches the selected display name; listed county is a source assertion, not a geometry lookup.',listed_county:hospital[1]},qualifiers:trimmed.slice(name.length)},begin,begin+trimmed.length)
      if(/pending|as of|\b20\d\d\b/i.test(trimmed))gaps.push('The selected hospital entry contains dated or pending designation language; no current designation is established.')
     }
     entryStart+=part.length+1
    }
   }
   const contact=/^(Nassau|Suffolk) OEM: (\d{3}-\d{3}-\d{4})((?: \| [^|\r\n]+)*)$/.exec(line)
   if(contact) {
    // Tail fields may be addresses or domains, never rendered as instructions.
    const tails=contact[3].split(' | ').filter(Boolean)
    if(tails.some(v=>!/^\d+ [A-Za-z0-9 .,'-]+$/.test(v)&&!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[a-z0-9/_-]*)?$/.test(v)))continue
    const reference=counties.find(c=>c.name===contact[1]);if(!reference)continue
    add({relation:'coordination_contact',subject:contact[1]+' OEM',value:contact[2],description:`${escape(attribution)} lists ${contact[1]} OEM telephone ${contact[2]}. Supplied geometry intersects ${contact[1]} County; this is a county coordination reference, not a finding of full containment, command assignment or authority. Verify the contact's current validity.`,location:{status:'county_intersection_reference',basis:'Recorded NYS boundary intersection selects a county reference; it does not establish emergency authority.',boundary:reference},qualifiers:null},start,start+line.length)
   }
  }
  // Reuse the existing typed inventory/deployment parser for retained uploads.
  // Exact source Facility ID to selected name is necessary; no fuzzy alias link.
  if(source.kind==='upload') {
   const visible=sourceLines(text),ids=visible.map(l=>/^Facility ID:[ \t]*([^\r\n]+)$/.exec(l.line)).filter(Boolean).map(m=>m[1].trim())
   if(ids.length!==1||ids[0]!==target)continue
   for(const row of documentEvidence([{name:source.source.name,content:visible.map(l=>l.line).join('\n')}]).filter(r=>['inventory','deployment'].includes(r.field)&&['supplied','conflicting'].includes(r.status))) {
    const value=documentValue(row),line=visible.find(l=>l.line===row.supporting_text)
    if(value===null||!line)continue
    add({relation:row.field+'_listing',subject:target,value,description:`${escape(attribution)} lists ${row.field} for ${escape(target)}: ${escape(value)}. This is a source-reported document assertion; current inventory and deployment are unverified.`,location:{status:'source_named_target',basis:'Exact selected display name matches the single Facility ID in the uploaded source.'},qualifiers:null},line.start,line.start+line.line.length)
   }
  }
 }
 return {rows,gaps}
}
