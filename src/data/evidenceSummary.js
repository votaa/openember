import fields from '../../shared/evidence-fields.json' assert {type:'json'}
import {scopedWeather} from './requestScope.js'

// Explicit labelled text only: absence of a match is extraction uncertainty.
export function documentEvidence(files=[]) {
  const rows=[]
  for(const file of files)for(const [field,labels] of Object.entries(fields)) {
    const matches=[...(file.content||'').matchAll(new RegExp('^('+labels.join('|')+')[ \t]*:[ \t]*([^\n\r]*)\r?$','gim'))]
    if(!matches.length)rows.push({source:file.name,field,status:'unverified',limitation:'No explicit labelled field extracted from this source; consult full text. This does not establish absence.'})
    for(const m of matches)rows.push({source:file.name,field,status:!m[2].trim()||/^(unknown|unspecified|not (?:provided|specified|named|supplied)|tbd)$/i.test(m[2].trim())?'not provided':'supplied',supporting_text:m[0],value:m[2].trim(),limitation:'Labelled source statement; applicability and authority require source review.'})
  }
  const conflicts=new Set(Object.keys(fields).filter(field=>new Set(rows.filter(r=>r.field===field&&r.status==='supplied').map(r=>r.value)).size>1))
  for(const row of rows)if(row.status==='supplied'&&conflicts.has(row.field))row.status='conflicting'
  return rows
}
// A bounded navigation aid; WINDOW MATCHES retains every eligible value.
export function weatherNavigation(weather,scope) {
  return scopedWeather(weather,scope).map(source=>{
    const {periods,series,...metadata}=source
    return {...metadata,period_samples:periods.slice(0,3).map(p=>({start:p.startTime,end:p.endTime,temperature:p.temperature??null,temperature_unit:p.temperatureUnit??null,wind:p.windSpeed??null,wind_direction:p.windDirection??null,precipitation_probability:p.probabilityOfPrecipitation??null})),period_count:periods.length,
      fields:Object.fromEntries(Object.entries(series).map(([field,data])=>[field,{unit:data.uom,coverage:data.coverage,interval_count:data.values.length,null_count:data.values.filter(v=>v.value==null).length,samples:data.values.slice(0,3)}])),
      limitations:'Navigation samples only; consult complete WINDOW MATCHES. Original intervals retained; coverage applies only to selected segment. Null fields are unknown. No full-window aggregate calculated. Hourly minima are not published nighttime lows.'}
  })
}
export function evidenceSummary(scope,weather,files=[]) {
  return 'SOURCE FACTS AND KNOWN GAPS (navigation aid; full KB and uploads remain authoritative source text):\n'+JSON.stringify({
    weather:weatherNavigation(weather,scope),documents:documentEvidence(files),
    gaps:['Facility applicability is unknown unless source-backed location evidence connects the facility to the supplied station or forecast area.',...(scope.interval&&Date.parse(scope.interval.start_utc)<Date.parse(scope.request_utc)?['Past/current weather requires applicable fresh observations; latest-only feeds cannot establish complete historical coverage.']:[])],
  })+'\n'
}
// Legacy clients include weather prose in separate live source blocks. Remove
// only those blocks; document text (including any weather quotations) is intact.
export function stripWeatherContext(context,files=[]) {
  const protectedText=files.map(f=>f.content)
  protectedText.forEach((text,i)=>{if(text)context=context.split(text).join(`EMBER_DOCUMENT_${i}_PROTECTED`)})
  const cleaned = context.split(/(?=^--- )/m).map(section=>section.startsWith('--- UPLOADED DOCUMENTS')?section:section.replace(/^(\[(?:NOAA|NWS)[^\n]*\n[\s\S]*?)(?=^\[|^--- |^RULES:|^AUTHORITATIVE |$(?![\s\S]))/gm,block=>
    /https:\/\/api\.weather\.gov\/(?:gridpoints\/|stations\/[^\s]+\/observations)/i.test(block)?'':block)).join('')
  return protectedText.reduce((text,document,i)=>text.split(`EMBER_DOCUMENT_${i}_PROTECTED`).join(document),cleaned)
}
