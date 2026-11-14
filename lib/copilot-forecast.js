import {instant,localDate,resolveWindow,requestWindows,overlaps} from './copilot-window.js'
// Resolve dates using the request's timezone; preserve original source intervals.
export function forecastPeriods(periods, scope, requestedAt) {
  if (scope.period === 'first period') return periods.slice(0,1)
  const interval = scope.period?.split(' to ')
  if (interval?.length===2) {
    const [start,end]=interval.map(instant)
    if (!Number.isFinite(start)||!Number.isFinite(end)||start>=end) return []
    const rows=periods.filter(p=>instant(p.startTime)<end && instant(p.endTime)>start).sort((a,b)=>instant(a.startTime)-instant(b.startTime))
    if (!rows.length||instant(rows[0].startTime)>start||instant(rows.at(-1).endTime)<end||rows.some((p,i)=>i&&instant(p.startTime)!==instant(rows[i-1].endTime))) return []
    return rows
  }
  const window=resolveWindow(scope.period,requestedAt,scope.timezone)
  if(!window)return []
  const wanted=localDate(window.start,scope.timezone)
  const night = scope.period.includes('night') || scope.fields.includes('low')
  return periods.filter(p=>Number.isFinite(instant(p.startTime))&&localDate(p.startTime,scope.timezone)===wanted && p.isDaytime===!night)
}

// Synthesis uses overlap with the requested window, including partial coverage.
export function contextForecastPeriods(request,periods) {
  const scope=requestWindows(request)
  return scope.requested ? periods.filter(p=>scope.windows.some(w=>overlaps(p.startTime,p.endTime,w))) : periods
}
