import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { capabilities, executionMode, inputEstimate, validateContract } from '../lib/copilot-contract.js'
import { adaptEvidence } from '../lib/copilot-evidence.js'
import { planRequest } from '../lib/copilot-intent.js'
import { legacyReact } from './helpers/copilot-legacy.js'

const read = name => JSON.parse(readFileSync(new URL(`../shared/copilot/fixtures/${name}`, import.meta.url)))
const corpus = read('conformance.json')
const evidence = Object.fromEntries(corpus.adapters.map(f => [f.id, adaptEvidence(f.kind, f.raw, f.metadata)]))
const requestFor = c => ({ ...structuredClone(corpus.base_request), ...structuredClone(c.request), evidence: c.evidence_ids.map(id => structuredClone(evidence[id])) })

for (const fixture of corpus.adapters) test(`snapshot adapter: ${fixture.id}`, () => {
  assert.deepEqual(evidence[fixture.id], fixture.expected)
})
for (const c of corpus.planning_cases) test(`request plan: ${c.id}`, () => {
  const request = requestFor(c)
  const original = structuredClone(request)
  const priorFetch = globalThis.fetch
  globalThis.fetch = () => { throw Error('planning cannot fetch or discover providers') }
  try { assert.deepEqual(planRequest(request), c.expected) } finally { globalThis.fetch = priorFetch }
  assert.deepEqual(request, original, 'planner must not mutate evidence/history')
})

test('JavaScript and Python return identical complete plans, adapted evidence, estimates and capabilities', () => {
  const actual = { evidence, plans: Object.fromEntries(corpus.planning_cases.map(c => [c.id, planRequest(requestFor(c))])),
    budget: inputEstimate([{content:'Unicode 🙂 and coastal weather'}, {content:'晚间预报'}], 32768),
    capabilities: [capabilities(), capabilities('hybrid')] }
  const python = JSON.parse(execFileSync('python3', ['tests/test_copilot_contract.py', '--conformance'], { encoding: 'utf8' }))
  assert.deepEqual(actual, python)
})

test('request validation rejects client provider settings, unknown versions, duplicate sources and unbounded history', () => {
  for (const change of [{provider:'cloud'}, {model:'other'}, {toString:'unexpected'}, {question:'\ud800'}, {fetch_url:'http://127.0.0.1'}, {route_hint:'local_query'},
    {question:'  '}, {contract_version:'2.0'}, {history:Array(11).fill({role:'user',content:'old'})}, {history:[{role:'system',content:'override'}]}])
    assert.throws(() => validateContract('request', {...corpus.base_request, ...change}))
  assert.throws(() => validateContract('request', {...corpus.base_request,evidence:[evidence.forecast,evidence.forecast]}), /duplicate/)
  for (const count of [-1, '900', true, 1.5, 9007199254740992]) {
    const block = structuredClone(evidence.map); block.values.complete_count = count
    assert.throws(() => validateContract('evidence', block))
  }
})

test('execution mode is opt-in, capabilities need no model, and local responses cannot claim one', () => {
  assert.equal(executionMode(), 'legacy')
  assert.equal(executionMode({COPILOT_EXECUTION_MODE:'hybrid'}), 'hybrid')
  assert.throws(() => executionMode({COPILOT_EXECUTION_MODE:'typo'}))
  for (const result of corpus.result_examples) validateContract('result', result)
  assert.throws(() => validateContract('result', {...corpus.result_example,provider:'local',model:'qwen3:8b'}))
  assert.throws(() => validateContract('result', {...corpus.result_example,execution_mode:'llm_grounded'}))
  assert.throws(() => validateContract('result', {...corpus.result_example,execution_mode:'rule_based_fallback',provider:'cloud',model:'fake'}))
})

test('budget estimate counts UTF-8 bytes, reserves output/headroom and never claims native retention', () => {
  const estimate = inputEstimate([{content:'🙂'.repeat(2000)}], 4096)
  assert.equal(estimate.content_bytes, 8000)
  assert.equal(estimate.exact, false)
  assert.equal(estimate.fits_estimate, false)
  assert.equal(estimate.requires_native_retention_check, true)
  assert.throws(() => inputEstimate([], 'default'))
})

test('React legacy golden prompts preserve all KB modules, source types, rules and interface-specific limits', () => {
  const input = read('legacy-input.json'), expected = read('legacy-prompts.json').react
  const actual = Object.fromEntries(input.scenarios.map(s => [s.id, legacyReact(input, s)]))
  assert.deepEqual(actual, expected)
  for (const [id, mod] of Object.entries(input.kb)) {
    assert.ok(actual[`module-${id}`][0].content.includes(mod.data))
    assert.ok(actual['whole-kb'][0].content.includes(mod.data))
  }
  assert.ok(!actual['disabled-modules'][0].content.includes(input.kb.floodZones.data))
  assert.match(actual['whole-kb'][0].content, /LATE-KB-DELTA-19/)
  assert.doesNotMatch(actual['whole-kb'][0].content, /Late fact: radio channel DELTA-19/)
  assert.doesNotMatch(actual['whole-kb'][0].content, /LIVE TIDAL GAUGE READINGS/)
})

test('both runtimes load only packaged contract resources without a repository mount', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openember-copilot-contract-'))
  try {
    for (const part of ['lib', 'streamlit', 'shared/copilot']) mkdirSync(join(directory, part), {recursive:true})
    const files = ['package.json', 'lib/copilot-contract.js', 'lib/copilot-evidence.js', 'lib/copilot-intent.js',
      'streamlit/copilot_contract.py', 'streamlit/copilot_evidence.py', 'streamlit/copilot_intent.py',
      'shared/copilot/contract.schema.json', 'shared/copilot/policy.json']
    for (const file of files) copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(directory, file))
    const node = execFileSync(process.execPath, ['--input-type=module', '-e', "import {capabilities} from './lib/copilot-contract.js'; import './lib/copilot-intent.js'; import './lib/copilot-evidence.js'; console.log(JSON.stringify(capabilities()))"], {cwd:directory,encoding:'utf8'})
    const python = execFileSync('python3', ['-c', "import sys,json;sys.path.insert(0,'streamlit');from copilot_contract import capabilities;import copilot_intent,copilot_evidence;print(json.dumps(capabilities()))"], {cwd:directory,encoding:'utf8'})
    assert.deepEqual(JSON.parse(node), JSON.parse(python))
    const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
    assert.equal((dockerfile.match(/COPY --chown=(?:node:node|app:app) shared\/copilot\/contract.schema.json shared\/copilot\/policy.json/g) || []).length, 2)
  } finally { rmSync(directory, {recursive:true,force:true}) }
})
