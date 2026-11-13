// Resolve dates using the request's timezone; preserve original source intervals.
export function forecastPeriods(periods, scope, requestedAt) {
  if (scope.period === 'first period') return periods.slice(0,1)
  const exact = periods.filter(p=>(p.name||'').toLowerCase()===scope.period)
  if (exact.length && !['today','tonight','tomorrow','tomorrow night'].includes(scope.period)) return exact
  const interval = scope.period?.split(' to ')
  if (interval?.length===2) {
    const [start,end]=interval.map(Date.parse)
    if (!Number.isFinite(start)||!Number.isFinite(end)||start>=end) return []
    const rows=periods.filter(p=>Date.parse(p.startTime)<end && Date.parse(p.endTime)>start).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime))
    if (!rows.length||Date.parse(rows[0].startTime)>start||Date.parse(rows.at(-1).endTime)<end||rows.some((p,i)=>i&&Date.parse(p.startTime)!==Date.parse(rows[i-1].endTime))) return []
    return rows
  }
  const dayKey=stamp=>{ const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:scope.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp)).map(p=>[p.type,p.value])); return `${parts.year}-${parts.month}-${parts.day}` }
  if (!['today','tonight','tomorrow','tomorrow night'].includes(scope.period)) return []
  // Noon UTC for calendar addition; dayKey is a local calendar date, not elapsed 24h across DST.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:scope.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(requestedAt)).map(p=>[p.type,p.value]))
  const local = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`)
  if (scope.period.startsWith('tomorrow')) local.setUTCDate(local.getUTCDate()+1)
  const wanted = local.toISOString().slice(0,10)
  const datedExact=exact.filter(p=>Number.isFinite(Date.parse(p.startTime))&&dayKey(p.startTime)===wanted)
  if(datedExact.length) return datedExact
  const night = scope.period.includes('night') || scope.fields.includes('low')
  return periods.filter(p=>Number.isFinite(Date.parse(p.startTime))&&dayKey(p.startTime)===wanted && p.isDaytime===!night)
}

// Synthesis may need both day and night; direct-query selection stays unchanged.
export function contextForecastPeriods(request,periods) {
  let text=request.question.toLowerCase()
  if(/^what about\b/.test(text)&&!/tonight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(text))text+=' '+request.history.filter(m=>m.role==='user').slice(-2).map(m=>m.content).join(' ').toLowerCase()
  const names=[...text.matchAll(/tomorrow night|tonight|today|tomorrow|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?: night)?/g)].map(m=>m[0])
  if(!names.length)return periods
  const selected=[]
  for(const name of names) {
    const scope={period:name,timezone:request.jurisdiction.timezone,fields:/\blow\b/.test(text)?['low']:/\bhigh\b/.test(text)?['high']:['temperature']}
    selected.push(...forecastPeriods(periods,scope,request.requested_at))
    if(!/\blow\b|\bhigh\b/.test(text)&&!name.includes('night')) {
      if(name==='today')scope.period='tonight'
      else scope.period=name+' night'
      selected.push(...forecastPeriods(periods,scope,request.requested_at))
    }
  }
  return [...new Map(selected.map(p=>[p.startTime,p])).values()].sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime))
}
