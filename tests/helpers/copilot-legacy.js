// Exercise unmodified production builders without starting browsers or inference.
import { readFileSync } from 'node:fs'
import { buildCopilotSystemPrompt } from '../../src/data/copilotPrompt.js'
import { summarizeWeather } from '../../src/data/weatherContext.js'
import { reportWindowMessage } from '../../src/data/regional/reportWindow.js'
import { mapLayerContext } from '../../src/data/mapLayerEvidence.js'

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')
const helpers = app.slice(app.indexOf('function summarizeAPIData('), app.indexOf('// ── Full NOAA endpoint'))
const build = new Function('CFG', 'summarizeWeather', 'reportWindowMessage', `${helpers}; return buildContextRT`)(
  { state: 'NY' }, summarizeWeather, reportWindowMessage)

export function legacyReact(input, scenario) {
  let context = build(input.files, input.api_results, scenario.enabled_modules, input.kb, input.jurisdiction,
    input.phase4_results, input.sources)
  context = context.replace(/--- LIVE API DATA \([^\n]+\) ---/, '--- LIVE API DATA (<request time>) ---')
  context += mapLayerContext(input.map_evidence)
  if (input.noaa_items.length) context += '--- NOAA DATA ---\n' + input.noaa_items.map(i => i.content).join('\n\n') + '\n\n'
  if (input.esri_items.length) context += '--- ESRI CATALOG METADATA ONLY (not feature records) ---\n' + input.esri_items.map(i => i.content).join('\n\n') + '\n'
  return [{ role: 'system', content: buildCopilotSystemPrompt(input.jurisdiction, context) },
    ...[...input.history, { role: 'user', content: scenario.question }].slice(-10)]
}
