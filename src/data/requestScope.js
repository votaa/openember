// Pure request-time contract. Browser snapshots are evidence, never provider settings.
// Sunrise equations: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export const SCOPE_VERSION='request-scope-v1'
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const months=['january','february','march','april','may','june','july','august','september','october','november','december']
const stamp='\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,3})?)?(?:Z|[+-]\\d{2}:\\d{2})'
export function instant(value) {
  if(typeof value!=='string'||!new RegExp(`^${stamp}$`,'i').test(value))return NaN
  const ms=Date.parse(value),date=Date.parse(value.slice(0,10)+'T00:00:00Z')
  return Number.isFinite(ms)&&Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===value.slice(0,10)&&Number(value.slice(11,13))<24 ? ms : NaN
}
const utc=ms=>new Date(ms).toISOString().replace('.000Z','Z')
function parts(ms,zone) {return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]))}
export function localStamp(value,zone) {
  const ms=typeof value==='number'?value:instant(value),p=parts(ms,zone)
  const local=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
  const offset=Math.round((Date.parse(local+'Z')-ms)/60000),a=Math.abs(offset)
  return local+(offset>=0?'+':'-')+String(Math.floor(a/60)).padStart(2,'0')+':'+String(a%60).padStart(2,'0')
}
const day=(ms,zone)=>localStamp(ms,zone).slice(0,10)
export function addDays(date,n) {const ms=Date.parse(date+'T00:00:00Z');return utc(ms+n*86400000).slice(0,10)}
function validDate(date) {return Number.isFinite(instant(date+'T00:00:00Z'))}
// Reject ambiguous/nonexistent civil clocks instead of silently picking a DST fold.
export function civil(date,clock,zone) {
  if(clock==='24:00')return civil(addDays(date,1),'00:00',zone)
  if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))return NaN
  const target=Date.parse(date+'T'+clock+':00Z'),offsets=new Set()
  for(const delta of [-36,0,36]) {
    const t=target+delta*3600000,p=parts(t,zone)
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)-t)
  }
  const choices=[...offsets].map(offset=>target-offset).filter(ms=>localStamp(ms,zone).slice(0,16)===date+'T'+clock)
  return choices.length===1?choices[0]:NaN
}
export function sunrise(date,reference) {
  if(!validDate(date)||!Array.isArray(reference)||reference.length!==2||reference.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.abs(reference[0])>=90||Math.abs(reference[1])>180)return NaN
  const year=Number(date.slice(0,4)),doy=(Date.parse(date+'T00:00:00Z')-Date.parse(`${year}-01-01T00:00:00Z`))/86400000+1
  const days=(Date.parse(`${year+1}-01-01T00:00:00Z`)-Date.parse(`${year}-01-01T00:00:00Z`))/86400000
  const g=2*Math.PI/days*(doy-1),c=Math.cos,s=Math.sin
  const eq=229.18*(.000075+.001868*c(g)-.032077*s(g)-.014615*c(2*g)-.040849*s(2*g))
  const dec=.006918-.399912*c(g)+.070257*s(g)-.006758*c(2*g)+.000907*s(2*g)-.002697*c(3*g)+.00148*s(3*g)
  const lat=reference[0]*Math.PI/180,x=c(90.833*Math.PI/180)/(c(lat)*c(dec))-Math.tan(lat)*Math.tan(dec)
  if(Math.abs(x)>1)return NaN
  const minutes=720-4*(reference[1]+Math.acos(x)*180/Math.PI)-eq
  return Date.parse(date+'T00:00:00Z')+Math.floor(minutes+.5)*60000
}
function interval(start,end,zone) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null
  return {start_utc:utc(start),end_utc:utc(end),start_local:localStamp(start,zone),end_local:localStamp(end,zone)}
}
function matchingPeriod(weather,date,night,zone,now,overnight=false) {
  const candidates=weather.filter(source=>!['stale','unavailable'].includes(source.state)).flatMap(source=>(source.data?.properties?.periods||[]).filter(p=>typeof p.isDaytime==='boolean'&&p.isDaytime===!night&&Number.isFinite(instant(p.startTime))&&Number.isFinite(instant(p.endTime))&&
    (overnight?instant(p.startTime)<=now&&instant(p.endTime)>now:day(instant(p.startTime),zone)===date&&Number(localStamp(p.startTime,zone).slice(11,13))>=12)).map(p=>({p,ref:{source:source.id,url:source.url,start:p.startTime,end:p.endTime,geography:source.geography}})))
  const unique=new Map(candidates.map(c=>[c.p.startTime+'|'+c.p.endTime,c]))
  return unique.size===1?[...unique.values()][0]:null
}
// Only explicit labelled IAP fields are schedule evidence. Unrelated dates are ignored.
export function extractIap(files,incident,now) {
  const plans=[]
  for(const file of files) {
    const text=file.content||''
    if(!/\b(?:IAP|incident action plan)\b/i.test(text))continue
    const id=/^Incident(?: ID| name)?[ \t]*:[ \t]*(.+)$/im.exec(text)?.[1]?.trim()
    if(incident&&id?.toLowerCase()!==incident.toLowerCase())continue
    const refs={document:file.name,incident:id||null,revision:/^Revision[ \t]*:[ \t]*(.+)$/im.exec(text)?.[1]?.trim()||null,approved:/^Approved[ \t]*:[ \t]*(.+)$/im.exec(text)?.[1]?.trim()||null}
    const current=/^Current operational period[ \t]*:[ \t]*(.+)$/im.exec(text)?.[1]
    const next=/^Next operational period[ \t]*:[ \t]*(.+)$/im.exec(text)?.[1]
    refs.current_period=current||null;refs.next_period=next||null
    if(!next)continue // Never extrapolate a next period from the current one.
    const parse=line=>{const m=new RegExp(`^(${stamp})\\s+to\\s+(${stamp})$`,'i').exec(line?.trim()||'');return m&&instant(m[1])<instant(m[2])?{start:instant(m[1]),end:instant(m[2])}:null}
    const cur=parse(current),nxt=parse(next)
    if(!incident||!id||!refs.approved||!/^(yes|approved)\b/i.test(refs.approved)||!cur||!nxt||!(cur.start<=now&&now<cur.end)||nxt.start<cur.end)plans.push({error:'IAP applicability, approval, timezone or current/next operational-period fields need clarification.',ref:refs})
    else plans.push({...nxt,ref:refs})
  }
  return plans
}
function resolveScope({question,requestedAt,jurisdiction,weather=[],files=[],policy,sunriseFn=sunrise}) {
  const zone=jurisdiction.timezone,now=instant(requestedAt)
  if(!Number.isFinite(now))throw Error('Invalid authoritative request time')
  const scope={version:SCOPE_VERSION,request_utc:utc(now),request_local:localStamp(now,zone),timezone:zone,jurisdiction:jurisdiction.name,status:'unspecified',method:null,interval:null,source_refs:[],assumptions:[],clarification:null,coverage:[]}
  const text=question.toLowerCase().replace(/’/g,"'")
  const clarify=message=>({...scope,status:'clarify',clarification:message})
  const resolved=(start,end,method,refs=[])=>{const i=interval(start,end,zone);return i?{...scope,status:'resolved',method,interval:i,source_refs:refs}:clarify('The requested clock is invalid or ambiguous across a daylight-saving transition. Supply explicit UTC offsets.')}
  const explicit=new RegExp(`(${stamp})\\s+to\\s+(${stamp})`,'i').exec(question)
  if(explicit)return resolved(instant(explicit[1]),instant(explicit[2]),'explicit')
  const localRange=/(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)\s+to\s+(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)/i.exec(question)
  if(localRange)return resolved(civil(localRange[1],localRange[2],zone),civil(localRange[3],localRange[4],zone),'explicit')
  if(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\bnext week\b/.test(text))return clarify('Specify an unambiguous calendar date or start/end interval.')
  if(/\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}.*\bto\b/.test(text))return clarify('Supply valid offset-bearing timestamps or unambiguous local clock endpoints.')
  if(new Set([...text.matchAll(new RegExp(`\\b(${weekdays.join('|')})\\b`,'g'))].map(m=>m[0])).size>1)return clarify('Supply explicit dates or a start/end interval for multiple weekdays.')
  const today=day(now,zone)
  let date=today,explicitDate=false
  const dates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0])
  if(dates.some(d=>!validDate(d)))return clarify('Supply a valid calendar date.')
  if(dates.length===2&&/\bto\b/.test(text))return resolved(civil(dates[0],'00:00',zone),civil(addDays(dates[1],1),'00:00',zone),'explicit')
  if(dates.length>1)return clarify('Specify a single date or an explicit start-to-end interval.')
  if(dates.length){date=dates[0];explicitDate=true}
  const monthMatch=new RegExp(`\\b(${months.join('|')}) (\\d{1,2})(?:,? (\\d{4}))?\\b`,'i').exec(text)
  if(monthMatch) {
    if(explicitDate)return clarify('Conflicting date expressions need clarification.')
    date=`${monthMatch[3]||today.slice(0,4)}-${String(months.indexOf(monthMatch[1])+1).padStart(2,'0')}-${monthMatch[2].padStart(2,'0')}`
    if(!validDate(date))return clarify('Supply a valid calendar date.')
    explicitDate=true
    if(!monthMatch[3])scope.assumptions.push('Named month/day uses the request-local year.')
  }
  const weekday=new RegExp(`\\b(${weekdays.join('|')})\\b`).exec(text)
  if(weekday) {
    if(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(text))return clarify('Which calendar date do you mean by next '+weekday[1]+'?')
    const target=addDays(today,(weekdays.indexOf(weekday[1])-new Date(today+'T00:00:00Z').getUTCDay()+7)%7)
    if(explicitDate&&new Date(date+'T00:00:00Z').getUTCDay()!==weekdays.indexOf(weekday[1]))return clarify('The weekday and explicit date disagree.')
    if(!explicitDate)date=target
  }
  const relative=[...text.matchAll(/\b(?:day after tomorrow|two days from now|next working day|tomorrow|today|tonight|overnight)\b/g)].map(m=>m[0])
  if(new Set(relative).size>1)return clarify('Specify one requested date/window, or an explicit start-to-end interval.')
  if(relative.length&&explicitDate)return clarify('The relative and explicit dates need clarification.')
  if(['tomorrow','next working day'].includes(relative[0]))date=addDays(today,1)
  if(['day after tomorrow','two days from now'].includes(relative[0]))date=addDays(today,2)
  if(weekday&&relative.length) {
    const offset=['tomorrow','next working day'].includes(relative[0])?1:['day after tomorrow','two days from now'].includes(relative[0])?2:0
    if(new Date(addDays(today,offset)+'T00:00:00Z').getUTCDay()!==weekdays.indexOf(weekday[1]))return clarify('The weekday and relative date disagree.')
  }
  const incident=/\bfor\s+([a-z]+-\d+)\b/i.exec(question)?.[1]||/\b([a-z]+-\d+)\b/i.exec(question)?.[1]||null
  const clocks=/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text)
  const requestedPart=/\b(am|morning|afternoon|evening)\b/.exec(text)?.[1]
  if(clocks) {
    const clock=(h,m,ap)=>{h=Number(h);if(ap&&(h<1||h>12))return 'invalid';return String(ap?(h%12)+(ap==='pm'?12:0):h).padStart(2,'0')+':'+(m||'00')}
    if(!explicitDate&&!weekday&&!relative.length)scope.assumptions.push('Undated clock range uses the request-local calendar date.')
    return resolved(civil(date,clock(clocks[1],clocks[2],clocks[3]),zone),civil(date,clock(clocks[4],clocks[5],clocks[6]),zone),'explicit')
  }
  if(new Set([...text.matchAll(/\b(am|morning|afternoon|evening)\b/g)].map(m=>m[0])).size>1||requestedPart&&/\b(tonight|overnight|night)\b/.test(text))return clarify('Specify one daypart or an explicit start/end interval.')
  if(/\bnext operational period\b/.test(text)&&!requestedPart) {
    // A dated/clock override is an analysis window, never a rewritten official IAP.
    if(!explicitDate&&!relative.length&&!weekday) {
      if(files.some(f=>/\bIAP\b|incident action plan/i.test(f.content)&&/^Current operational period:/im.test(f.content)&&!/^Next operational period:/im.test(f.content)))scope.assumptions.push('An uploaded IAP defines only its current period; no next period was extrapolated.')
      const plans=extractIap(files,incident,now)
      scope.source_refs=plans.map(p=>p.ref)
      if(plans.length>1||plans.some(p=>p.error))return clarify('Conflicting or incomplete IAP schedules: select the incident/current approved plan and supply offset-bearing period fields.')
      if(plans.length)return resolved(plans[0].start,plans[0].end,'IAP',[plans[0].ref])
      const schedules=(policy.incident_schedules||[]).filter(p=>incident&&p.incident.toLowerCase()===incident.toLowerCase())
      if(schedules.length>1)return clarify('Conflicting configured incident schedules.')
      if(schedules.length) {
        const s=schedules[0]
        if(!Number.isFinite(instant(s.valid_until))||instant(s.valid_until)<now||!(instant(s.start)>=now)||!s.source)return clarify('The configured incident schedule is stale or incomplete.')
        return resolved(instant(s.start),instant(s.end),'configured',[{source:s.source,incident}])
      }
    }
    if(!policy.planning_fallback.enabled)return clarify('No applicable next operational period or planning fallback is configured.')
    let start=sunriseFn(date,jurisdiction.center)
    if(!explicitDate&&!relative.length&&!weekday&&start<=now){date=addDays(date,1);start=sunriseFn(date,jurisdiction.center)}
    if(!Number.isFinite(start))return clarify('Sunrise is unavailable for the configured Long Island planning reference/date.')
    scope.assumptions.push('Application planning fallback: sunrise plus 16 elapsed hours including breaks; all calendar days are eligible. Incident operations continue around the clock. This is not an IAP or command-approved schedule.')
    return resolved(start,start+policy.planning_fallback.duration_seconds*1000,'assumed',[{source:'configured jurisdiction center',reference:jurisdiction.center,date,solar_boundary:'sunrise',algorithm:policy.planning_fallback.algorithm}])
  }
  const night=/\b(?:tonight|overnight|night)\b/.test(text)
  if(night) {
    let period=matchingPeriod(weather.filter(s=>s.geography===jurisdiction.name),date,true,zone,now,relative[0]==='overnight')
    if(relative[0]==='overnight'&&!period)period=matchingPeriod(weather.filter(s=>s.geography===jurisdiction.name),date,true,zone,now)
    if(!period)return clarify('The requested night is not uniquely covered by a supplied local point-forecast night period. Supply explicit start/end times or refresh the forecast.')
    return resolved(instant(period.p.startTime),instant(period.p.endTime),'source_period',[period.ref])
  }
  const part=/\b(am|morning|afternoon|evening)\b/.exec(text)?.[1]
  if(part) {
    const [start,end]=policy.dayparts[part];scope.assumptions.push('Application '+part+' boundary: '+start+':00–'+end+':00 local.')
    return resolved(civil(date,String(start).padStart(2,'0')+':00',zone),civil(date,String(end).padStart(2,'0')+':00',zone),'configured')
  }
  if(/\blater today\b/.test(text)){scope.assumptions.push('Later today means the remaining local calendar day.');return resolved(now,civil(addDays(today,1),'00:00',zone),'configured')}
  if(explicitDate||relative.length||weekday)return resolved(civil(date,'00:00',zone),civil(addDays(date,1),'00:00',zone),'explicit')
  return scope
}

function durationEnd(value) {
  const [start,duration,...extra]=String(value||'').split('/'),m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration||'')
  if(!m||extra.length)return NaN
  const seconds=Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0)
  return seconds>0?instant(start)+seconds*1000:NaN
}
export function scopedWeather(weather,scope) {
  return weather.map(source=>{
    const out={id:source.id,url:source.url,geography:source.geography,area:source.area||null,fetched_at:source.fetched_at||null,state:source.state||'available',coverage:'unknown',periods:[],series:{}}
    if(scope.status!=='resolved'||source.geography!==scope.jurisdiction||['stale','unavailable'].includes(out.state))return out
    const start=instant(scope.interval.start_utc),end=instant(scope.interval.end_utc),overlap=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a<b&&a<end&&b>start
    const p=source.data?.properties||{},intervals=[]
    if(Array.isArray(p.periods)) {
      out.periods=p.periods.filter(row=>overlap(instant(row.startTime),instant(row.endTime)))
      intervals.push(...out.periods.map(row=>[instant(row.startTime),instant(row.endTime)]))
      out.coverage=covered(intervals,start,end)?'complete':'partial'
    }
    for(const key of ['windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation'])if(Array.isArray(p[key]?.values)) {
      const rows=p[key].values.filter(row=>overlap(instant(String(row.validTime).split('/')[0]),durationEnd(row.validTime)))
      out.series[key]={uom:p[key].uom||null,values:rows,coverage:covered(rows.filter(row=>row.value!==null&&row.value!==undefined).map(row=>[instant(row.validTime.split('/')[0]),durationEnd(row.validTime)]),start,end)?'complete':'partial'}
      out.coverage='field-specific; no full-window aggregate calculated'
    }
    return out
  })
}
function covered(intervals,start,end) {let cursor=start;for(const [a,b]of intervals.sort((a,b)=>a[0]-b[0])){if(a>cursor)return false;cursor=Math.max(cursor,b);if(cursor>=end)return true}return false}
export function renderRequestScope(scope,weather=[]) {
  return 'REQUEST SCOPE (application resolved; source snapshots are client-supplied evidence):\n'+JSON.stringify(scope)+'\nWINDOW MATCHES (only these weather intervals may establish facts for this window; partial/missing/null coverage is unknown):\n'+JSON.stringify(scopedWeather(weather,scope))+'\n'
}

// Keep full relevant source snapshots separately; pass only explicit weather fields.
export function weatherSnapshots(results,jurisdiction) {
  return results.filter(r=>r?.ep&&r.data?.properties&&(['periods','windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation'].some(k=>Array.isArray(k==='periods'?r.data.properties[k]:r.data.properties[k]?.values)))).map(r=>({
    id:r.ep.id,url:r.ep.url,geography:jurisdiction.name,area:r.ep.name,fetched_at:r.fetchedAt||r.fetched_at||null,state:(r.ok??r.success)?'available':'unavailable',
    data:{properties:Object.fromEntries(['periods','windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation'].filter(k=>Array.isArray(k==='periods'?r.data.properties[k]:r.data.properties[k]?.values)).map(k=>[k,r.data.properties[k]]))},
  }))
}

export function resolveRequestScope(input) {
  const scope=resolveScope(input)
  if(scope.interval)scope.historical=instant(scope.interval.end_utc)<=instant(scope.request_utc)
  scope.coverage=scopedWeather(input.weather||[],scope).map(s=>({id:s.id,state:s.state,coverage:s.coverage,fields:Object.fromEntries(Object.entries(s.series).map(([k,v])=>[k,v.coverage]))}))
  return scope
}

export function needsScopeRefresh(result,question,requestedAt,jurisdiction,policy) {
  const weather=weatherSnapshots([result],jurisdiction)
  if(!weather.length)return false
  const scope=resolveRequestScope({question,requestedAt,jurisdiction,weather,policy})
  if(scope.historical)return false
  if(scope.status==='clarify')return /night|tonight|overnight/i.test(question)
  return scope.status==='resolved'&&scope.coverage.some(s=>s.coverage==='partial'||Object.values(s.fields).includes('partial'))
}
