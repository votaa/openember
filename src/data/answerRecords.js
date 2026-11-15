// The model can select these application-owned records; source paragraphs are never answer records.
import {documentEvidence} from './evidenceSummary.js'
import {scopedWeather} from './requestScope.js'
import {selectCoops} from './coopsEvidence.js'
export const ANSWER_VERSION='operational-answer-v2'
export const OUTPUT_SCHEMA={type:'object',additionalProperties:false,required:['version','records'],properties:{version:{const:ANSWER_VERSION},records:{type:'array',maxItems:24,uniqueItems:true,items:{type:'string'}}}}
export const escape=text=>String(text??'unknown').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/([\\`*_[\]#!|])/g,'\\$1').replace(/[\r\n]/g,' ')
const number=n=>String(Math.round(n*100)/100)
const units={'wmoUnit:degC':'°C','wmoUnit:degF':'°F','wmoUnit:km_h-1':'km/h','wmoUnit:m_s-1':'m/s','wmoUnit:percent':'%','wmoUnit:Pa':'Pa','wmoUnit:m':'m','wmoUnit:mm':'mm','wmoUnit:degree_(angle)':'degrees'}
const labels={temperature:'temperature',windSpeed:'wind',windGust:'gusts',relativeHumidity:'humidity',barometricPressure:'pressure',visibility:'visibility',precipitationLastHour:'last-hour precipitation',probabilityOfPrecipitation:'precipitation probability',quantitativePrecipitation:'precipitation interval amounts',snowfallAmount:'snowfall interval amounts',iceAccumulation:'ice interval amounts'}
export function queryTopics(question='') {
 const q=question.toLowerCase(),has=re=>re.test(q)
 return {weather:has(/weather|forecast|conditions|observations?|measured|temperature|\blow\b|wind|gust|rain|snow|precipitation|humidity|visibility/),water:has(/tide|water|flood|surge|coastal|gauge/),assets:has(/cones?|inventory|deploy|equipment/),command:has(/commander|command|assignment/),radio:has(/radio|channel|communications/),procedures:has(/procedure|\bsop\b|protocol|mandatory|authorized|evacuat/),thresholds:has(/threshold|trigger|action limit/),impacts:has(/impacts?|assess|risks?|threat|effects?|likelihood/),facility:has(/facility|site/),documents:has(/\bplan\b|document|upload/),contacts:has(/contacts?|phone|telephone/),evacuation:has(/evacuat/),heat:has(/heat|hot|cooling/),humidity:has(/humidity/),visibility:has(/visibility/)}
}
const fieldTopic={commander:'command',assignment_status:'command',inventory:'assets',deployment:'assets',cone_specifications:'assets',cone_ballast:'assets',cone_placement:'assets',radio_channel:'radio',facility_id:'facility',facility_coordinates:'facility',radio_authority:'radio',command_succession:'command'}
// Supported scalar/document grammars, not a classifier or verifier of arbitrary prose.
function documentValue(row) {
 const v=row.value||'',scalar=/^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,79}$/u
 if(['commander','cone_specifications','cone_placement'].includes(row.field)&&scalar.test(v))return v
 if(['facility_id','radio_channel'].includes(row.field)&&/^[A-Z0-9_-]{1,64}$/.test(v))return v
 if(row.field==='cone_ballast'&&/^\d+(?:\.\d+)? (?:lb|kg)(?: (?:each|on each deployed cone))?$/.test(v))return v
 if(row.field==='inventory'&&/^\d+ [\p{L}-]+ cones\.?$/u.test(v))return v
 if(row.field==='deployment'&&/^\d+ [\p{L}-]+ cones deployed at [\p{L}\p{N} '-]{1,60}(?: for this exercise)?(?:; remaining \d+ in storage)?$/u.test(v))return v
 if(row.field==='assignment_status'&&/^(assigned|unassigned|vacant|pending)$/i.test(v))return v
 if(row.field==='facility_coordinates') {const m=/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(v);if(m&&Math.abs(+m[1])<=90&&Math.abs(+m[2])<=180)return v}
 return null
}
export function buildAnswerRecords({scope,files=[],weather=[],coops=[],context='',question='',operational}) {
 const records=[],t=queryTopics(question),add=(section,text,source='application',kind='fact',required=true)=>{if(!records.some(r=>r.section===section&&r.text===text))records.push({id:'a'+records.length,section,text,source,kind,required})}
 const relevant=field=>{
  if(field==='assignment_status')return /assignment status|vacant|unassigned|assigned/i.test(question)
  if(field==='facility_id')return /facility (?:id|identifier)/i.test(question)
  if(field==='facility_coordinates')return t.facility&&t.impacts||/coordinates|facility location|site location/i.test(question)
  if(['cone_specifications','cone_ballast','cone_placement'].includes(field))return t.assets&&t.impacts||new RegExp(field.split('_')[1],'i').test(question)
  return t[fieldTopic[field]]
 }
 const docs=documentEvidence(files)
 for(const file of files) {
  const missing=[],review=[]
  for(const row of docs.filter(r=>r.source===file.name&&relevant(r.field))) {
   if(['radio_authority','command_succession'].includes(row.field)) {
    if(row.status==='supplied'&&!operational.records.some(r=>r.source===row.source&&r.kind==='procedure'))review.push(row.field.replaceAll('_',' '))
    continue
   }
   const value=documentValue(row),name=row.field.replaceAll('_',' ')
   if(row.status==='supplied'&&value!==null)add('Facts',`${escape(file.name)} — ${name}: ${escape(value)}.`,file.name,row.field)
   else if(row.status==='conflicting')add('Gaps',`${escape(file.name)} contains conflicting ${name} statements; no single value is established.`,file.name,'conflict')
   else if(row.status==='not provided')add('Gaps',`${escape(file.name)} does not supply ${name}; this does not establish absence.`,file.name,'gap')
   else if(row.status==='supplied')review.push(name)
   else missing.push(name)
  }
  if(t.assets)for(const m of file.content.matchAll(/\b([A-Z][A-Z0-9-]*):\s*(\d+)\s+([A-Za-z-]+)\s+cones\b/g))add('Facts',`${escape(file.name)} — inventory entry ${escape(m[1])}: ${m[2]} ${escape(m[3])} cones; deployment is not established by this count.`,file.name,'inventory')
  if(t.radio)for(const m of file.content.matchAll(/\bradio channel\s+([A-Z0-9-]+)/g))add('Facts',`${escape(file.name)} lists radio channel ${escape(m[1])}; listing alone does not authorize use.`,file.name,'radio_channel')
  if(t.command&&/\bno (?:incident )?commander (?:is )?(?:specified|supplied|named)/i.test(file.content))add('Gaps',`${escape(file.name)} does not name a commander in the supplied passage; actual assignment is not established by that omission.`,file.name,'gap')
  const recovered=new Set(records.filter(r=>r.source===file.name&&r.section==='Facts').map(r=>r.kind))
  if(records.some(r=>r.source===file.name&&r.text.includes('does not name a commander')))recovered.add('commander')
  const absent=missing.filter(name=>!recovered.has(name.replaceAll(' ','_')))
  if(absent.length)add('Gaps',`${escape(file.name)}: ${escape([...new Set(absent)].join(', '))} not extracted as labelled fields. Consult the full source; non-extraction is not absence.`,file.name,'gap')
  if(review.length)add('Gaps',`${escape(file.name)}: ${escape([...new Set(review)].join(', '))} needs source review before use as an applicable fact or procedure.`,file.name,'gap')
 }
 if(t.weather)for(const s of scopedWeather(weather,scope)) {
  if(s.periods.length) {
   const vals=s.periods.filter(p=>Number.isFinite(p.temperature)),us=new Set(vals.map(p=>p.temperatureUnit))
   if(vals.length&&us.size===1)add('Facts',`${s.granularity==='hourly'?'Minimum in the supplied hourly forecast':'Minimum among supplied overlapping point-period values'}: ${number(Math.min(...vals.map(p=>p.temperature)))} °${escape(vals[0].temperatureUnit)}; coverage ${s.coverage}${vals.length!==s.periods.length?', some temperature values missing':''}. ${s.granularity==='hourly'?'Not a published nighttime low.':'Not an extremum resolved to a sub-period.'}`,s.id,'forecast')
   const winds=[...new Set(s.periods.map(p=>`${p.windSpeed||'unknown'} ${p.windDirection||''}`))],pops=[...new Set(s.periods.map(p=>p.probabilityOfPrecipitation?.value??'unknown'))]
   add('Facts',`Supplied ${s.granularity} wind: ${escape(winds.join('; '))}; precipitation probabilities: ${escape(pops.join(', '))}%. Coverage ${s.coverage}.`,s.id,'forecast')
   add('Sources',`Forecast URL: ${escape(s.url)}.`,s.id,'source')
  }
  const fields=['windGust',...(t.humidity?['relativeHumidity']:[]),...(t.visibility?['visibility']:[]),...(/rain|precipitation/i.test(question)?['quantitativePrecipitation']:[]),...(/snow/i.test(question)?['snowfallAmount']:[])]
  for(const field of fields)if(s.series[field]) {
   const data=s.series[field],ns=data.values.map(v=>v.value).filter(v=>typeof v==='number'&&Number.isFinite(v))
   add('Facts',`${labels[field]||field} in supplied grid intervals: ${ns.length?number(Math.min(...ns))+'–'+number(Math.max(...ns))+' '+escape(units[data.uom]||'unknown units'):'unknown'}; coverage ${data.coverage}. ${field==='quantitativePrecipitation'||field==='snowfallAmount'?'Interval amounts are not an accumulated window total.':''} Source: ${escape(s.url)}.`,s.id,'forecast')
  }
  if(s.observation&&Object.keys(s.observation.fields).length) {
   const obs=s.observation,wanted=t.humidity&&!/weather|conditions/i.test(question)?['relativeHumidity']:t.visibility&&!/weather|conditions/i.test(question)?['visibility']:['temperature','windSpeed','windGust']
   const values=wanted.filter(k=>obs.fields[k]).map(k=>{const d=obs.fields[k];return `${labels[k]} ${typeof d.value==='number'&&Number.isFinite(d.value)?number(d.value):'unknown'} ${escape(units[d.unitCode]||'unknown units')}${d.qualityControl&&d.qualityControl!=='V'?' (quality '+escape(d.qualityControl)+')':''}`})
   const station=s.url.match(/\/stations\/([^/]+)/)?.[1]||obs.station
   add('Facts',`${escape(station)} (${escape(s.station_role||'station reference')}) at ${escape(obs.timestamp)}: ${values.join('; ')}. Source: ${escape(s.url)}.`,s.id,'observation')
  }
 }
 if(t.weather&&scope.method==='current_observation')add('Gaps',scope.observation_selection?.mode==='named_station'?'Readings are measured at the named station, not automatically at a facility.':`Regional overview: ${new Set(scopedWeather(weather,scope).filter(s=>s.observation&&Object.keys(s.observation.fields).length).map(s=>s.station_id)).size} of ${scope.observation_selection?.stations.length||0} configured station records selected. Readings do not establish conditions at an unspecified facility.`,'application','gap')
 if(t.weather&&!records.some(r=>['forecast','observation'].includes(r.kind)))add('Gaps','No eligible weather values were selected for this request; refresh the sources or clarify the time/place.','application','gap')
 if(t.water)for(const s of selectCoops(coops,scope,question)) {
  if(s.state==='outside_requested_geography')continue
  const events=s.product==='predictions'?s.events:s.events.slice(-1),background=events.length?[]:s.background
  for(const e of [...events,...background])add('Facts',`${escape(s.station_name)} (${s.station_id}, ${escape(s.role)}): ${s.product==='predictions'?'astronomical '+(e.type==='H'?'high':'low')+' tide prediction':background.length?'current background only, not a future forecast':'measured '+escape(s.product)} ${number(e.values.height??e.values.speed)} ${s.product==='wind'?(s.units==='english'?'knots':'m/s'):s.units==='english'?'ft':'m'}${s.datum?' '+escape(s.datum):''} at ${escape(e.time_local)} / ${escape(e.time_utc)}. Facility linkage: ${(scope.facility_linkages||[]).some(r=>r.station_id===s.station_id)?'source documents a gauge/site linkage; see request metadata':'unknown'}. Source: ${escape(s.url)}.`,s.id,'coops')
  if(!events.length)add('Gaps',`${escape(s.station_name)}: no eligible ${escape(s.product)} events for the requested window (${escape(s.state)}).`,s.id,'gap')
 }
 for(const r of operational.records) {
  const channels=docs.filter(d=>d.source===r.source&&d.field==='radio_channel'&&d.status==='supplied').map(d=>documentValue(d)).filter(Boolean)
  const radioMatch=t.radio&&channels.some(c=>(r.action||'').includes(c))
  const commandMatch=t.command&&/\bcommand(?:er)?\b/i.test(r.action||'')
  const genericProcedure=t.procedures&&!t.radio&&!t.command
  if(r.kind==='gauge_linkage'&&t.water)add('Facts',`${escape(r.source)} documents linkage of ${escape(r.target)} to gauge ${escape(r.station_id)}; issuer ${escape(r.authority)}; valid ${escape(r.valid_start)}–${escape(r.valid_end)}.`,r.source,r.kind)
  if(r.kind==='threshold'&&t.thresholds||r.kind==='procedure'&&(radioMatch||commandMatch||genericProcedure))add('Facts',`${escape(r.source)} states: “${escape(r.statement)}” Issuer: ${escape(r.authority)}; valid ${escape(r.valid_start)}–${escape(r.valid_end)}; ${escape(r.source_url)}.`,r.source,r.kind)
 }
 if(t.procedures||t.thresholds||t.radio||t.command)for(const issue of operational.issues)add('Gaps',escape(issue))
 if((t.procedures||t.thresholds)&&!operational.records.some(r=>['threshold','procedure'].includes(r.kind)))add('Gaps','No applicable operational threshold or mandatory procedure was validated. Full source material remains available for review.')
 if(t.impacts) {
  if(t.assets&&records.some(r=>r.kind==='inventory'||r.kind==='deployment'))add('Possible impacts','Cone displacement is possible if cones are deployed. A stability assessment needs a supported wind rating and applicable installation conditions; the forecast is not an equipment action limit.')
  if(t.facility||t.water)add('Gaps','Facility location, exposure and vulnerability must be established before assigning a site-specific impact likelihood.')
 }
 // Navigation only: neither source bodies nor source-authored headings enter answer text.
 if(files.length&&(t.facility||t.documents||t.assets||t.command||t.radio||t.procedures||t.thresholds))for(const file of files)add('Sources',`Uploaded source: ${escape(file.name)}. Full text is available under Request sources.`,file.name,'navigation',false)
 if(!Object.values(t).some(Boolean))add('Gaps','This request needs source interpretation beyond the validated record types. Inspect the full request sources; no operational requirement has been inferred.')
 if(!records.length)add('Gaps','No matching validated answer records were extracted. Inspect the full request sources for information not represented by these record types.')
 const facts=records.filter(r=>r.section==='Facts'),gaps=records.filter(r=>r.section==='Gaps').map(r=>r.text)
 return {version:ANSWER_VERSION,route:'bounded_query_records',topics:t,records,facts,gaps,references:records.filter(r=>r.kind==='navigation')}
}
export function answerInstruction(evidence) {
 return '\nCONTROLLED OUTPUT CONTRACT: Answer only the user question. Return JSON {"version":"'+ANSWER_VERSION+'","records":[]}. Select the smallest useful set of relevant application record IDs, up to 24; an empty optional selection is allowed. Required records are rendered independently. Do not add prose, values, procedures or source paragraphs. Enabled evidence is not automatically relevant. Registry: '+JSON.stringify(evidence.records.map(({id,section,text,required})=>({id,section,text,required})))
}
export function renderAnswerRecords(raw,evidence,scope,complete=true) {
 let selected=[],disposition='incomplete'
 try {
  const obj=JSON.parse(raw)
  if(!complete||!obj||Object.keys(obj).sort().join(',')!=='records,version'||obj.version!==ANSWER_VERSION||!Array.isArray(obj.records)||obj.records.length>24||obj.records.some(id=>typeof id!=='string')||new Set(obj.records).size!==obj.records.length)throw Error()
  selected=obj.records.map(id=>{const row=evidence.records.find(r=>r.id===id);if(!row)throw Error();return row})
  disposition='validated_envelope'
 }catch{selected=[]}
 const chosen=evidence.records.filter(r=>r.required||selected.some(s=>s.id===r.id)),lines=[]
 if(disposition==='incomplete')lines.push('⚠ Incomplete answer: provider output did not complete the controlled format. Supported records follow.','')
 if(scope.interval)lines.push(`${scope.historical?'Historical analysis: ':''}${escape(scope.interval.start_local||scope.interval.start_utc)} to ${escape(scope.interval.end_local||scope.interval.end_utc)} (${escape(scope.timezone)}; ${escape(scope.method)}).`,'')
 if(scope.clarification)lines.push('Clarification needed: '+escape(scope.clarification),'')
 if(scope.assumptions?.length)lines.push(...scope.assumptions.map(escape),'')
 for(const section of ['Facts','Possible impacts','Gaps','Suggestions','Sources']) {
  const rows=chosen.filter(r=>r.section===section)
  if(rows.length)lines.push('## '+section,'',...rows.map(r=>'- '+r.text),'')
 }
 return {answer:lines.join('\n').trim(),disposition}
}
