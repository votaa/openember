import {buildLocationEvidenceBundle,linkAnswerClaims} from './locationEvidenceBundle.js'
import {instant} from './requestScope.js'
import {buildAnswerRecords,answerInstruction,renderAnswerRecords} from './answerRecords.js'
export {ANSWER_VERSION,OUTPUT_SCHEMA} from './answerRecords.js'
// Machine-readable source assertions are data, never instructions. No model-created record is trusted.
function operationalRecords(files,scope,question) {
  const records=[],issues=[]
  for(const file of files)for(const m of file.content.matchAll(/```operational-evidence-v1\s*\n([\s\S]*?)\n```/g)) {
    let row;try{row=JSON.parse(m[1])}catch{issues.push(`${file.name}: invalid operational evidence block.`);continue}
    const required=['kind','target','authority','source_url','valid_start','valid_end','statement']
    if(!row||required.some(k=>typeof row[k]!=='string'||!row[k].trim())||!['threshold','procedure','gauge_linkage'].includes(row.kind)||!/^https:\/\//.test(row.source_url)||!scope.interval||instant(row.valid_start)>instant(scope.interval.start_utc)||instant(row.valid_end)<instant(scope.interval.end_utc)||!Number.isFinite(instant(row.valid_start))||!Number.isFinite(instant(row.valid_end))) {issues.push(`${file.name}: operational evidence lacks valid source, authority, type or full-window validity.`);continue}
    const targetLines=[...file.content.matchAll(/^Facility ID:[ \t]*(.+)$/gm)].map(x=>x[1].trim())
    if(!targetLines.includes(row.target)||!(question.match(/[A-Za-z0-9_-]+/g)||[]).includes(row.target)){issues.push(`${file.name}: operational evidence target is not linked to this request.`);continue}
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
    records.push({kind:row.kind,source:file.name,key:row.kind+':'+row.target+':'+(row.quantity||row.conditions||'gauge_linkage'),statement:canonical,action:row.kind==='procedure'?row.action:null,conditions:row.kind==='procedure'?row.conditions:null,station_id:row.station_id||null,target:row.target,authority:row.authority,source_url:row.source_url,valid_start:row.valid_start,valid_end:row.valid_end})
  }
  for(const row of records)if(new Set(records.filter(r=>r.key===row.key).map(r=>r.statement)).size>1){row.conflicting=true;issues.push(`${row.source}: conflicting operational evidence for ${row.kind} at ${row.target}.`)}
  return {records:records.filter(r=>!r.conflicting),issues}
}
export function buildOperationalEvidence(input) {
  input.scope.evidence_bundle=buildLocationEvidenceBundle(input)
  const operational=operationalRecords(input.files||[],input.scope,input.question||'')
  input.scope.facility_linkages=operational.records.filter(r=>r.kind==='gauge_linkage').map(r=>({target:r.target,station_id:r.station_id,source:r.source,statement:r.statement}))
  return linkAnswerClaims(input.scope.evidence_bundle,buildAnswerRecords({...input,operational}))
}
export const operationalInstruction=answerInstruction
export const renderOperationalAnswer=renderAnswerRecords
