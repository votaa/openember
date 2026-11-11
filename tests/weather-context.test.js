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

test('night forecast keeps its own low, wind range and timezone separate from tomorrow high', () => {
  const data = {properties:{periods:[
    {name:'Tonight', isDaytime:false, startTime:'2026-11-10T18:00:00-05:00', endTime:'2026-11-11T06:00:00-05:00', temperature:44, temperatureUnit:'F', windSpeed:'7 to 10 mph', windDirection:'W'},
    {name:'Wednesday', isDaytime:true, startTime:'2026-11-11T06:00:00-05:00', endTime:'2026-11-11T18:00:00-05:00', temperature:60, temperatureUnit:'F', windSpeed:'5 mph', windDirection:'W'},
  ]}}
  const summary = summarizeWeather(data)
  const first = summary.split('\n')[1]
  assert.match(first, /Period 1 — Tonight/)
  assert.match(first, /Low 44°F; wind 7 to 10 mph W/)
  assert.match(first, /18:00:00-05:00 — 2026-11-11T06:00:00-05:00/)
  assert.doesNotMatch(first, /60°F|High/)
  assert.match(summary.split('\n')[2], /Period 2 — Wednesday.*High 60°F/)
  assert.equal(JSON.parse(pythonSummary(data)), summary)
  assert.match(COPILOT_RULES, /use only period 1/)
})

test('hourly temperatures are not labeled highs or lows; observations stay on the observation path', () => {
  const hourly = {properties:{periods:[{name:'', isDaytime:false, temperature:44, temperatureUnit:'F'}]}}
  assert.match(summarizeWeather(hourly), /Temperature 44°F/)
  assert.equal(JSON.parse(pythonSummary(hourly)), summarizeWeather(hourly))
  const observation = {properties:{windSpeed:{unitCode:'wmoUnit:km_h', value:12}, temperature:{value:8}}}
  assert.equal(summarizeWeather(observation), null)
  assert.equal(JSON.parse(pythonSummary(observation)), null)
})
