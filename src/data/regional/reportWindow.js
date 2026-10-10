// Socrata created_date is a floating timestamp in the source timezone.
function localTimestamp(instant, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

export function reportWindow(source, evaluatedAt) {
  if (!source.rolling_window_days) return null
  const end = new Date(evaluatedAt)
  const start = new Date(end.getTime() - source.rolling_window_days * 86400000)
  const timezone = source.source_timestamp_timezone
  return { start: localTimestamp(start, timezone), end: localTimestamp(end, timezone), timezone }
}

export function windowedSource(source, evaluatedAt) {
  const window = reportWindow(source, evaluatedAt)
  if (!window) return source
  const clause = `created_date >= '${window.start}' AND created_date <= '${window.end}'`
  return { ...source, required_filter: `(${source.required_filter}) AND ${clause}`,
    aggregate_queries: (source.aggregate_queries || []).map(query => ({
      ...query, required_filter: `(${query.required_filter}) AND ${clause}`,
    })) }
}

export function restrictReportWindow(source, result, evaluatedAt) {
  const window = reportWindow(source, evaluatedAt)
  if (!window) return result
  const records = (result.records || []).filter(record => {
    const timestamp = Date.parse(`${record.observed_at?.replace(/Z$/, '')}Z`)
    return timestamp >= Date.parse(`${window.start}Z`) && timestamp <= Date.parse(`${window.end}Z`)
  })
  return { ...result, records, report_window: window,
    ...(result.data_state === 'stale' ? {
      aggregate_counts: (result.aggregate_counts || []).map(item => ({ ...item, total: null })),
      aggregate_state: 'partial', aggregate_reason: 'refresh_failed',
    } : {}) }
}

export function reportWindowMessage(source, result) {
  if (!source.rolling_window_days) return null
  const total = (result.aggregate_counts || []).find(item => item.key === 'all_reported_hazards')?.total
  if (result.data_state === 'current' && result.aggregate_state === 'current' && total === 0) {
    return 'No recent data in the last 7 days.'
  }
  return 'Past 7 days only · NYC 311 created_date · America/New_York'
}
