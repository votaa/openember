// Calendar windows are independent of feed labels, fetch time and point coverage.
const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const token = /\b(?:\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?\s+to\s+\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?|\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?|tomorrow night|tonight|today|tomorrow|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: night)?)\b/gi
export function instant(stamp) {
  if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(stamp)) return NaN
  const date=stamp.slice(0,10), parsed=Date.parse(stamp)
  if(Number(stamp.slice(11,13))>23||Number(stamp.slice(14,16))>59||Number(stamp.slice(17,19)||0)>59)return NaN
  return Number.isFinite(parsed) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date ? parsed : NaN
}
export function localDate(stamp, timezone) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant(stamp))).map(p=>[p.type,p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
function add(date, days) {const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function civil(date,hour,timezone) {
  const target=Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00Z`)
  let value=target
  for(let i=0;i<4;i++) {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]))
    const offset=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)-value
    value=target-offset
  }
  return new Date(value).toISOString().replace('.000Z','Z')
}
export function resolveWindow(period, requestedAt, timezone) {
  try {
    period=period.toLowerCase().trim()
    const range=period.split(/\s+to\s+/)
    if(range.length===2 && range[0].includes('t')) {
      const [start,end]=range.map(instant)
      return start<end ? {start:new Date(start).toISOString().replace('.000Z','Z'),end:new Date(end).toISOString().replace('.000Z','Z'),timezone} : null
    }
    let date=localDate(requestedAt,timezone), endDate
    const night=period==='tonight'||period.endsWith(' night')
    const name=period.replace(/ night$/,'')
    if(/^\d{4}-\d{2}-\d{2}$/.test(range[0])) {
      date=range[0];endDate=range.at(-1)
      if(!Number.isFinite(instant(date+'T00:00:00Z'))||!Number.isFinite(instant(endDate+'T00:00:00Z'))||endDate<date)return null
    } else if(name==='tomorrow') date=add(date,1)
    else if(weekdays.includes(name)) date=add(date,(weekdays.indexOf(name)-new Date(date+'T00:00:00Z').getUTCDay()+7)%7)
    else if(!['today','tonight'].includes(name))return null
    return {start:civil(date,night?18:0,timezone),end:civil(add(endDate||date,1),night?6:0,timezone),timezone}
  } catch { return null }
}
export function requestWindows(request) {
  let names=[...request.question.matchAll(token)].map(m=>m[0])
  if(!names.length && /^what about\b/i.test(request.question)) {
    const previous=request.history.filter(m=>m.role==='user').at(-1)
    names=[...(previous?.content||'').matchAll(token)].map(m=>m[0])
  }
  return {requested:names.length>0,windows:names.map(name=>resolveWindow(name,request.requested_at,request.jurisdiction.timezone)).filter(Boolean)}
}
export function overlaps(start,end,window) {return instant(start)<instant(end)&&instant(start)<instant(window.end)&&instant(end)>instant(window.start)}

// Union coverage permits overlapping intervals but never bridges a missing interval.
export function coversWindow(periods,window) {
  let cursor=instant(window.start)
  for(const p of periods.filter(p=>Number.isFinite(instant(p.startTime))&&Number.isFinite(instant(p.endTime))).sort((a,b)=>instant(a.startTime)-instant(b.startTime))) {
    const start=instant(p.startTime),end=instant(p.endTime)
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=cursor)continue
    if(start>cursor)return false
    cursor=Math.max(cursor,end)
    if(cursor>=instant(window.end))return true
  }
  return false
}
