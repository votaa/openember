import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { SOURCE_REGISTRY } from '../src/config/jurisdiction.js'
import { reportWindowMessage } from '../src/data/regional/reportWindow.js'
import { COPILOT_RULES } from '../src/data/copilotPrompt.js'

// Exercise the production request builder, without mounting the browser UI.
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const builder = app.slice(app.indexOf('function buildContextRT('), app.indexOf('// ── Full NOAA endpoint'))
const buildContext = new Function('reportWindowMessage', `${builder}; return buildContextRT`)(reportWindowMessage)
const id = 'nyc_311_electric_hazards_rockaway'
const source = SOURCE_REGISTRY.find(source => source.id === id)
const result = {data_state:'current', aggregate_state:'current', fetched_at:'2026-11-10T23:30:00Z',
  report_window:{start:'2026-11-03T18:30:00',end:'2026-11-10T18:30:00',timezone:'America/New_York'},
  aggregate_counts:[{key:'all_reported_hazards',label:'All included reports',total:3}], records:[]}

test('React chat includes configured 311 source URL, window, filter and fetch time alongside map facts', () => {
  const context = buildContext([], [], [], {}, 'Long Island', {[id]:result}, SOURCE_REGISTRY)
  assert.ok(context.includes(`Source URL: ${source.endpoint}`))
  assert.ok(context.includes(source.required_filter))
  assert.ok(context.includes(result.fetched_at))
  assert.ok(context.includes(result.report_window.start))
  assert.ok(context.includes(result.report_window.end))
  assert.match(context, /All included reports: 3 reports in the past 7 days/)
  assert.match(context, /not utility-confirmed outages/)
  assert.match(COPILOT_RULES, /Copy source URLs exactly/)
  assert.doesNotMatch(context, /https:\/\/311.nyc.gov\/data/)
  // The live call site must pass the same registry used to fetch these sources.
  assert.match(app, /buildContextRT\(files, apiResults, activeKB, KB_RT, CFG_RT.name, phase4Results, CFG.sources\)/)
})

test('missing 311 source metadata is explicit instead of inventing a URL', () => {
  const context = buildContext([], [], [], {}, 'Long Island', {[id]:result})
  assert.match(context, /Source URL: unavailable/)
  assert.doesNotMatch(context, /https:/)
  assert.doesNotMatch(buildContext([], [], [], {}, 'Long Island'), /311/)
})

test('Streamlit request builder retains the same 311 citation provenance', () => {
  const context = execFileSync('python3', ['-c', `
import ast,json,sys
from pathlib import Path
sys.path.insert(0,'streamlit')
from copilot_prompt import build_knowledge_base_context
from report_window import report_window_message
source,result=json.load(sys.stdin)
class Config:
 name='Long Island'
 def source(self,source_id): return source
node=next(n for n in ast.parse(Path('streamlit/app.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='build_context')
namespace=dict(CFG=Config(),KNOWLEDGE_BASE={},build_knowledge_base_context=build_knowledge_base_context,report_window_message=report_window_message,json=json)
exec(compile(ast.Module(body=[node],type_ignores=[]),'<request builder>','exec'),namespace)
print(namespace['build_context']([],[],[],[],phase4_results={source['id']:result}))
`], {input:JSON.stringify([source,result]),encoding:'utf8'})
  for (const value of [source.endpoint, source.required_filter, result.fetched_at, result.report_window.start, result.report_window.end]) assert.ok(context.includes(value))
})
