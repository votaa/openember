import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { SOURCE_REGISTRY } from '../src/config/jurisdiction.js'
import { reportWindow, windowedSource, restrictReportWindow, reportWindowMessage } from '../src/data/regional/reportWindow.js'
import { fetchRockawaySource } from '../src/data/regional/rockawaySources.js'
import { phase4SourceCard } from '../src/data/regional/phase4Sources.js'

const source = SOURCE_REGISTRY.find(source => source.id === 'nyc_311_electric_hazards_rockaway')
const now = '2026-10-10T16:00:00Z'

test('React and Streamlit windows match across daylight saving transitions', () => {
  const times = [now, '2026-03-10T16:00:00Z', '2026-11-03T16:00:00Z']
  const python = JSON.parse(execFileSync('python3', ['-c', `
import sys,json
sys.path.insert(0, 'streamlit')
from report_window import report_window, windowed_source
source=json.loads(sys.argv[1])
print(json.dumps([{'window':report_window(source,t), 'source':windowed_source(source,t)} for t in json.loads(sys.argv[2])]))
`, JSON.stringify(source), JSON.stringify(times)], { encoding: 'utf8' }))
  assert.deepEqual(times.map(time => ({ window: reportWindow(source, time), source: windowedSource(source, time) })), python)
  assert.deepEqual(reportWindow(source, now), { start: '2026-10-03T12:00:00', end: '2026-10-10T12:00:00', timezone: 'America/New_York' })
})

test('browse and all aggregate requests share bounded seven-day filters', async () => {
  const urls = []
  const row = { agency: 'HPD', complaint_type: 'ELECTRIC', descriptor: 'POWER OUTAGE', borough: 'QUEENS', community_board: '14 QUEENS', latitude: '40.6', longitude: '-73.8' }
  const result = await fetchRockawaySource(source, { fetchedAt: now, fetchImpl: async raw => {
    const url = new URL(raw); urls.push(url)
    return { ok: true, json: async () => url.searchParams.get('$select').startsWith('count') ? [{ total: '2' }] : [
      { ...row, unique_key: 'old', created_date: '2026-10-03T11:59:59' },
      { ...row, unique_key: 'start', created_date: '2026-10-03T12:00:00.000' },
      { ...row, unique_key: 'end', created_date: '2026-10-10T12:00:00.000' },
      { ...row, unique_key: 'future', created_date: '2026-10-10T12:00:00.001' },
    ] }
  } })
  assert.equal(urls.length, 5)
  for (const url of urls) {
    assert.match(url.searchParams.get('$where'), /created_date >= '2026-10-03T12:00:00' AND created_date <= '2026-10-10T12:00:00'/)
    assert.match(url.searchParams.get('$where'), /14 QUEENS/)
  }
  assert.equal(urls[0].searchParams.get('$limit'), '500')
  assert.ok(urls.slice(1).every(url => !url.searchParams.has('$limit')))
  assert.deepEqual(result.records.map(row => row.properties.source_record_id), ['start', 'end'])
})

test('empty period differs from failures and stale records expire', () => {
  const empty = { records: [], data_state: 'current', aggregate_state: 'current', aggregate_counts: [{ key: 'all_reported_hazards', total: 0 }] }
  assert.match(phase4SourceCard(source, empty).note, /No recent data in the last 7 days/)
  for (const state of ['unavailable', 'stale', 'partial']) {
    assert.doesNotMatch(reportWindowMessage(source, { ...empty, data_state: state }), /No recent data/)
  }
  assert.doesNotMatch(reportWindowMessage(source, { ...empty, aggregate_state: 'partial' }), /No recent data/)
  assert.doesNotMatch(reportWindowMessage(source, { ...empty, aggregate_counts: [{ key: 'all_reported_hazards', total: 1 }] }), /No recent data/)
  const stale = restrictReportWindow(source, { ...empty, data_state: 'stale', records: [{ observed_at: '2020-01-01T00:00:00' }] }, now)
  assert.deepEqual(stale.records, [])
  assert.equal(stale.aggregate_counts[0].total, null)
})

test('both runtimes return identical seven-day results and empty cards', async () => {
  for (const rows of [[], [
    { unique_key: 'recent', created_date: '2026-10-09T12:00:00', agency: 'DOT', complaint_type: 'Blocked Road', descriptor: 'Flooding', borough: 'QUEENS', community_board: '14 QUEENS', latitude: '40.6', longitude: '-73.8' },
    { unique_key: 'old', created_date: '2020-01-01T12:00:00', agency: 'DOT', complaint_type: 'Blocked Road', descriptor: 'Flooding', borough: 'QUEENS', community_board: '14 QUEENS', latitude: '40.6', longitude: '-73.8' },
  ]]) {
    const result = await fetchRockawaySource(source, { fetchedAt: now, fetchImpl: async raw => ({ ok: true,
      json: async () => new URL(raw).searchParams.get('$select').startsWith('count') ? [{ total: rows.length ? '1' : '0' }] : rows,
    }) })
    const python = JSON.parse(execFileSync('python3', ['-c', `
import sys,json
from urllib.parse import urlparse,parse_qs
sys.path.insert(0,'streamlit')
from regional_normalization import fetch_rockaway_source
from phase4_sources import phase4_source_card
source=json.loads(sys.argv[1]);rows=json.loads(sys.argv[2]);now=sys.argv[3]
class Response:
 def __init__(self,url): self.url=url
 def raise_for_status(self): pass
 def json(self):
  return [{'total':'1' if rows else '0'}] if parse_qs(urlparse(self.url).query)['$select'][0].startswith('count') else rows
result=fetch_rockaway_source(source,lambda url,**kwargs:Response(url),now)
print(json.dumps({'result':result,'card':phase4_source_card(source,result)}))
`, JSON.stringify(source), JSON.stringify(rows), now], { encoding: 'utf8' }))
    assert.deepEqual({ result, card: phase4SourceCard(source, result) }, python)
  }
})
