import {documentEvidence} from './evidenceSummary.js'
import {scopedWeather,instant} from './requestScope.js'
import {selectCoops} from './coopsEvidence.js'
export const ANSWER_VERSION='operational-answer-v1'
export const OUTPUT_SCHEMA={type:'object',additionalProperties:false,required:['version','references'],properties:{version:{const:ANSWER_VERSION},references:{type:'array',maxItems:12,uniqueItems:true,items:{type:'string'}}}}
const escape=text=>String(text??'unknown').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/([\\`*_[\]#!|])/g,'\\$1').replace(/[\r\n]/g,' ')
const quote=(source,text)=>`Source ${escape(source)} states: “${escape(text)}”`
const omission=/^(unknown|unspecified|not (?:provided|specified|named|supplied)|tbd)$/i
// Machine-readable source assertions are data, never instructions. No model-created record is trusted.
function operationalRecords(files,scope,question) {
  const records=[],issues=[]
  for(const file of files)for(const m of file.content.matchAll(/```operational-evidence-v1\s*\n([\s\S]*?)\n```/g)) {
    let row;try{row=JSON.parse(m[1])}catch{issues.push(`${file.name}: invalid operational evidence block.`);continue}
    const required=['kind','target','authority','source_url','valid_start','valid_end','statement']
    if(!row||required.some(k=>typeof row[k]!=='string'||!row[k].trim())||!['threshold','procedure','gauge_linkage'].includes(row.kind)||!/^https:\/\//.test(row.source_url)||!scope.interval||instant(row.valid_start)>instant(scope.interval.start_utc)||instant(row.valid_end)<instant(scope.interval.end_utc)||!Number.isFinite(instant(row.valid_start))||!Number.isFinite(instant(row.valid_end))) {issues.push(`${file.name}: operational evidence lacks valid source, authority, type or full-window validity.`);continue}
    const targetLines=[...file.content.matchAll(/^Facility ID:[ \t]*(.+)$/gm)].map(x=>x[1].trim())
    if(!targetLines.includes(row.target)||!question.includes(row.target)){issues.push(`${file.name}: operational evidence target is not linked to this request.`);continue}
    let canonical
    if(row.kind==='threshold') {
      if(!['>','>=','<','<='].includes(row.operator)||typeof row.value!=='number'||!Number.isFinite(row.value)||!['ft','m','mph','km/h'].includes(row.unit)||typeof row.quantity!=='string'||!['wind_speed','wind_gust','water_level'].includes(row.quantity)||!['MLLW','MHHW','NAVD88','not applicable'].includes(row.datum)||!/^\d{7}$/.test(row.station_id||'')){issues.push(`${file.name}: invalid threshold quantity, comparator, unit, datum or station.`);continue}
      if((row.quantity==='water_level')!==(row.unit==='ft'||row.unit==='m')||row.quantity==='water_level'&&row.datum==='not applicable'||row.quantity!=='water_level'&&row.datum!=='not applicable'){issues.push(`${file.name}: incompatible threshold units or datum.`);continue}
      canonical=`${row.target}: ${row.quantity} ${row.operator} ${row.value} ${row.unit}; datum ${row.datum}; station ${row.station_id}.`
    } else if(row.kind==='gauge_linkage') {
      if(!/^\d{7}$/.test(row.station_id||'')||typeof row.basis!=='string'||!row.basis.trim()){issues.push(`${file.name}: gauge linkage lacks station/basis.`);continue}
      canonical=`${row.target}: water-level gauge linkage station ${row.station_id}; basis ${row.basis}.`
    } else {
      if(typeof row.conditions!=='string'||!row.conditions.trim()||typeof row.action!=='string'||!row.action.trim()){issues.push(`${file.name}: procedure lacks conditions/action.`);continue}
      canonical=`${row.target}: when ${row.conditions}, ${row.authority} requires ${row.action}.`
    }
    // A deterministic canonical supporting sentence must also occur outside the data block.
    if(row.statement!==canonical||!file.content.replace(m[0],'').split(/\r?\n/).includes(canonical)){issues.push(`${file.name}: operational record does not match its supporting source sentence.`);continue}
    records.push({kind:row.kind,source:file.name,key:row.kind+':'+row.target+':'+(row.quantity||row.conditions||'gauge_linkage'),statement:canonical,station_id:row.station_id||null,target:row.target,authority:row.authority,source_url:row.source_url,valid_start:row.valid_start,valid_end:row.valid_end})
  }
  for(const row of records)if(new Set(records.filter(r=>r.key===row.key).map(r=>r.statement)).size>1){row.conflicting=true;issues.push(`${row.source}: conflicting operational evidence for ${row.key}.`)}
  return {records:records.filter(r=>!r.conflicting),issues}
}
export function buildOperationalEvidence({scope,files=[],weather=[],coops=[],context='',question=''}) {
  const facts=[],gaps=[],references=[]
  const operational=operationalRecords(files,scope,question)
  scope.facility_linkages=operational.records.filter(r=>r.kind==='gauge_linkage').map(r=>({target:r.target,station_id:r.station_id,source:r.source,statement:r.statement}))
  const add=(text,source='application',kind='fact')=>facts.push({id:'f'+facts.length,kind,source,text})
  const documents=documentEvidence(files)
  for(const row of documents) {
    if(row.status==='supplied')add(quote(row.source,row.supporting_text),row.source,row.field)
    else if(row.status==='conflicting')gaps.push(quote(row.source,row.supporting_text)+' Conflicting source statements; applicability is unresolved.')
    else if(row.status==='unverified'){}
    else if(row.status==='not provided')gaps.push(quote(row.source,row.supporting_text)+' This is an omission in this source; it does not establish the actual status or override evidence supplied elsewhere.')
  }
  for(const file of files) {
    const unverified=documents.filter(r=>r.source===file.name&&r.status==='unverified').map(r=>r.field.replaceAll('_',' '))
    if(unverified.length)gaps.push(`${escape(file.name)}: no explicit labelled fields extracted for ${escape(unverified.join(', '))}. Consult the full source; extraction uncertainty does not establish absence.`)
    // Exact source statements, without upgrading inventory/channel/identifier to deployment/authority/location.
    for(const m of file.content.matchAll(/\b[A-Z][A-Z0-9-]*:\s*\d+\s+[^.\n]*\bcones\b[^.\n]*\.?|\bradio channel\s+[A-Z0-9-]+/gi))add(quote(file.name,m[0]),file.name,'source_statement')
    if(/\bno (?:incident )?commander (?:is )?(?:specified|supplied|named)/i.test(file.content))gaps.push(`${escape(file.name)} does not name a commander in the supplied passage. This source does not establish absence or override an assignment supplied elsewhere.`)
  }
  const eligible=scopedWeather(weather,scope)
  for(const source of eligible) {
    if(source.periods.length||Object.keys(source.series).length) {
      add(`Forecast source: ${escape(source.url)}; area ${escape(source.area||source.geography)}; fetched ${escape(source.fetched_at)}; coverage ${escape(source.coverage)}.`,source.id,'forecast')
      if(source.periods.length) {
        const values=source.periods.filter(p=>typeof p.temperature==='number'),units=new Set(values.map(p=>p.temperatureUnit))
        if(values.length&&units.size===1)add(`Minimum in the supplied ${source.granularity} forecast: ${Math.min(...values.map(p=>p.temperature))} °${escape(values[0].temperatureUnit)}; selected interval ${escape(source.selected_interval?.start_utc)} to ${escape(source.selected_interval?.end_utc)}; coverage ${escape(source.coverage)}. This is not a published nighttime low or a full-window minimum when coverage is partial.`,source.id,'forecast')
        const winds=[...new Set(source.periods.map(p=>`${p.windSpeed||'unknown'} ${p.windDirection||''}`))]
        const probabilities=[...new Set(source.periods.map(p=>p.probabilityOfPrecipitation?.value??'unknown'))]
        add(`Wind values in the supplied ${source.granularity} forecast: ${escape(winds.join('; '))}. Precipitation probabilities in supplied periods: ${escape(probabilities.join(', '))}%. Coverage ${escape(source.coverage)}. See the original source for interval times; selected coverage is shown in application metadata.`,source.id,'forecast')
      }
      for(const [field,data]of Object.entries(source.series)) {
        const numbers=data.values.map(v=>v.value).filter(v=>typeof v==='number'&&Number.isFinite(v))
        add(`${escape(field)} (${escape(data.uom||'unknown units')}): ${numbers.length?`supplied interval values range ${Math.min(...numbers)} to ${Math.max(...numbers)}`:'no numeric values supplied'}; field coverage ${escape(data.coverage)}; null/non-numeric intervals ${data.values.length-numbers.length}. This range is not an accumulated total or an observation. Source: ${escape(source.url)}.`,source.id,'forecast')
      }
    }
    if(source.observation&&Object.keys(source.observation.fields).length)add(`Measured observation at ${escape(source.observation.timestamp)}; station ${escape(source.observation.station)}; fields ${escape(JSON.stringify(source.observation.fields))}. Source: ${escape(source.url)}.`,source.id,'observation')
  }
  for(const s of selectCoops(coops,scope,question)) {
    for(const e of s.events)add(`${escape(s.station_name)} (${escape(s.station_id)}, ${escape(s.role)}): ${s.product==='predictions'?'astronomical tide prediction':'measured '+escape(s.product)} ${escape(JSON.stringify(e.values))}; ${escape(s.product==='wind'?(s.units==='english'?'knots, direction degrees':'m/s, direction degrees'):(s.units==='english'?'ft':'m'))}; datum ${escape(s.datum||'not applicable')}; ${escape(e.time_local)} / ${escape(e.time_utc)}; quality ${escape(e.quality||'prediction')}. Source: ${escape(s.url)}. Facility applicability: ${escape(s.facility_applicability)}.`,s.id,'coops')
    if(s.background.length&&!s.events.length)add(`Current background only, not a future forecast: ${escape(s.station_name)} at ${escape(s.background[0].time_utc)}; ${escape(JSON.stringify(s.background[0].values))} ${escape(s.product==='wind'?(s.units==='english'?'knots, direction degrees':'m/s, direction degrees'):(s.units==='english'?'ft':'m'))}; datum ${escape(s.datum||'not applicable')}. Source: ${escape(s.url)}.`,s.id,'background')
    if(!s.events.length)gaps.push(`${escape(s.station_name||s.id)}: no eligible ${escape(s.product||'CO-OPS')} events for the requested window; state ${escape(s.state)}.`)
  }
  for(const r of operational.records)add(`${quote(r.source,r.statement)} Issuer: ${escape(r.authority)}; validity ${escape(r.valid_start)} to ${escape(r.valid_end)}; reference ${escape(r.source_url)}. This is an attributed source requirement, not independent confirmation of issuer authority.`,r.source,r.kind)
  gaps.push(...operational.issues.map(escape))
  if(!operational.records.some(r=>r.kind==='threshold'))gaps.push('No operational threshold was validated by this response path. Consult the full sources for unextracted threshold evidence; forecast values are not action limits.')
  if(!operational.records.some(r=>r.kind==='procedure'))gaps.push('No mandatory procedure was validated by this response path. Retained source statements may document authorization; a listed channel or contact alone does not establish it.')
  gaps.push('Inventory does not establish deployment. Source omissions do not establish an absent commander. Verify actual deployment and assignment using the applicable plan.','Facility-specific flood, utility and equipment-stability likelihoods are not established here. Tide predictions, precipitation probability and current alerts do not establish those likelihoods.')
  // Full sources stay in provider context. Bounded exact excerpts support general KB/document questions.
  for(const [source,text]of [['Enabled KB/context',context.split('KNOWLEDGE BASE:\n').at(-1).split('\n\nRULES:')[0].split('--- UPLOADED DOCUMENTS')[0]],...files.map(f=>[f.name,f.content])])for(const passage of text.split(/\n\s*\n/).filter(p=>p.trim()&&!p.includes('```operational-evidence-v1'))) {
    references.push({id:'r'+references.length,source,text:quote(source,passage)+' Reference excerpt only; operational applicability is not established by this excerpt.'})
  }
  return {version:ANSWER_VERSION,route:'bounded_evidence_default',facts:facts.filter((r,i,a)=>a.findIndex(x=>x.text===r.text)===i),gaps:[...new Set(gaps)],references}
}
export function operationalInstruction(evidence) {
  return '\nCONTROLLED OUTPUT CONTRACT: Return only a JSON object {"version":"'+ANSWER_VERSION+'","references":["r0"]}. Select up to 12 relevant exact-reference IDs from the registry; no prose, new values, actions or extra fields. Application code renders required facts/gaps independently. Prior assistant messages are not evidence. Complete KB/uploads remain source data. Registry: '+JSON.stringify(evidence.references.map(r=>({id:r.id,source:r.source,starts_with:r.text.slice(0,160)})))
}
export function renderOperationalAnswer(raw,evidence,scope,complete=true) {
  let selected=[],disposition='incomplete'
  try {
    const obj=JSON.parse(raw)
    if(!complete||!obj||Object.keys(obj).sort().join(',')!=='references,version'||obj.version!==ANSWER_VERSION||!Array.isArray(obj.references)||obj.references.length>12||new Set(obj.references).size!==obj.references.length)throw Error()
    selected=obj.references.map(id=>{const r=evidence.references.find(r=>r.id===id);if(!r)throw Error();return r})
    disposition='validated_envelope'
  }catch{selected=[]}
  const interval=scope.interval
  const lines=[disposition==='incomplete'?'⚠ Incomplete answer: the provider output was interrupted or did not match the controlled evidence format. Supported evidence follows.':'Application-rendered evidence; source attribution does not independently verify source authority.','',`Requested interval: ${escape(interval?.start_local||interval?.start_utc||'unresolved')} to ${escape(interval?.end_local||interval?.end_utc||'unresolved')} (${escape(scope.timezone||'unknown zone')}); method ${escape(scope.method||scope.status)}.`, '', '## Facts','',...evidence.facts.map(r=>'- '+r.text)]
  if(scope.clarification)lines.push('','Clarification needed: '+escape(scope.clarification))
  if(scope.assumptions?.length)lines.push('','Application assumptions: '+scope.assumptions.map(escape).join(' '))
  if(evidence.facts.some(r=>/cones/i.test(r.text)))lines.push('','## Possible impacts','','- Cone displacement is possible if cones are deployed, but stability cannot be assessed without applicable specifications, ballast and placement. The inventory count does not establish deployment or a wind action limit.')
  if(selected.length)lines.push('','## Source references','',...selected.map(r=>'- '+r.text))
  lines.push('','## Gaps','',...evidence.gaps.map(g=>'- '+g),'','## Suggestions','','- Verify the applicable equipment specifications, deployed inventory, current command assignment and authorized communications procedure before deciding on site actions.')
  return {answer:lines.join('\n'),disposition}
}
