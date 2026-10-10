import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { summarizeWeather } from '../src/data/weatherContext.js'
import { buildCopilotSystemPrompt, COPILOT_RULES } from '../src/data/copilotPrompt.js'

function pythonSummary(data) {
  return execFileSync('python3', ['-c', 'import json,sys;sys.path.insert(0,"streamlit");from weather_context import summarize_weather;print(json.dumps(summarize_weather(json.load(sys.stdin))))'], {input:JSON.stringify(data), encoding:'utf8'}).trim()
}

test('forecast retains Sunday beyond the previous four-period cutoff, detail and valid times in both apps', () => {
  const data = {properties:{updated:'2026-10-10T15:00:00Z', periods:Array.from({length:14}, (_, i) => ({name:i === 5 ? 'Sunday' : `Period ${i}`, startTime:`time-${i}`, endTime:`end-${i}`, detailedForecast:'Rain. New rainfall amounts between a quarter and half an inch possible.', shortForecast:'Rain', temperature:60, temperatureUnit:'F', windSpeed:'10 mph', windDirection:'NE', probabilityOfPrecipitation:{value:80}}))}}
  const summary = summarizeWeather(data)
  assert.match(summary, /Sunday \[time-5 — end-5\]/)
  assert.match(summary, /quarter and half an inch/)
  assert.match(summary, /80%/)
  assert.match(summary, /Period 13/)
  assert.equal(JSON.parse(pythonSummary(data)), summary)
})

test('precipitation grids retain units, intervals, zero values and missing values consistently', () => {
  const data = {properties:{updateTime:'2026-10-10', quantitativePrecipitation:{uom:'wmoUnit:mm', values:[{validTime:'2026-10-11T00:00:00Z/PT6H', value:12.7}, {validTime:'dry', value:0}, {validTime:'gap', value:null}]}}}
  const summary = summarizeWeather(data)
  assert.match(summary, /wmoUnit:mm/)
  assert.match(summary, /PT6H: 12.7/)
  assert.match(summary, /dry: 0/)
  assert.match(summary, /gap: unavailable/)
  assert.equal(JSON.parse(pythonSummary(data)), summary)
  assert.equal(summarizeWeather({features:[]}), null)
})

test('ordinary questions and refreshed evidence use the same grounding rules in both versions', () => {
  const pythonRules = execFileSync('python3', ['-c', 'import sys;sys.path.insert(0,"streamlit");from copilot_prompt import COPILOT_RULES;print(COPILOT_RULES)'], {encoding:'utf8'}).trim()
  assert.equal(pythonRules, COPILOT_RULES)
  const prompt = buildCopilotSystemPrompt('Long Island', 'Sunday: Rain [NWS]')
  assert.match(prompt, /user does not need to mention the KB/)
  assert.match(prompt, /latest supplied evidence over earlier assistant claims/)
  assert.match(prompt, /Zero active alerts does not mean no rain/)
  assert.match(prompt, /Sunday: Rain \[NWS\]/)
})
