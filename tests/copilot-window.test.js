import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolveWindow,requestWindows,coversWindow,overlaps} from '../lib/copilot-window.js'
import {forecastPeriods,contextForecastPeriods} from '../lib/copilot-forecast.js'
import {buildLocalContext} from '../lib/copilot-context.js'
import {COPILOT_RULES} from '../src/data/copilotPrompt.js'
const data=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/date-windows.json',import.meta.url)))
for(const c of data.cases)test(`date/window: ${c.id}`,()=>assert.deepEqual(resolveWindow(c.period,c.at,data.timezone),c.start?{start:c.start,end:c.end,timezone:data.timezone}:null))
test('shared window fixtures agree across runtimes',()=>assert.deepEqual(data.cases.map(c=>resolveWindow(c.period,c.at,data.timezone)),JSON.parse(execFileSync('python3',['tests/test_copilot_window.py','--projections'],{encoding:'utf8'}))))
test('timestamps override misleading weekday names and preserve source values',()=>{
 const request={question:'Monday weather',requested_at:'2026-11-14T17:00:00Z',jurisdiction:{timezone:data.timezone},history:[]}
 const rows=[{name:'Monday',isDaytime:true,startTime:'2026-11-09T06:00:00-05:00',endTime:'2026-11-09T18:00:00-05:00'},{name:'Wrong label',isDaytime:true,startTime:'2026-11-16T06:00:00-05:00',endTime:'2026-11-16T18:00:00-05:00'}]
 assert.deepEqual(forecastPeriods(rows,{period:'monday',timezone:data.timezone,fields:['high']},request.requested_at),rows.slice(1))
 assert.deepEqual(contextForecastPeriods(request,rows),rows.slice(1))
 const window=requestWindows(request).windows[0]
 assert.equal(coversWindow(rows,window),false)
 assert.equal(overlaps(window.start,window.start,window),false)
 assert.equal(overlaps(window.end,window.start,window),false)
 assert.equal(overlaps('2026-11-17T05:00:00Z','2026-11-17T06:00:00Z',window),false)
 assert.equal(coversWindow([{startTime:window.start,endTime:'2026-11-16T12:00:00Z'},{startTime:'2026-11-16T13:00:00Z',endTime:window.end}],window),false)
 request.history=[{role:'user',content:'Sunday weather'},{role:'assistant',content:'Tuesday weather'}];request.question='What about tomorrow?'
 assert.equal(requestWindows(request).windows[0].start,'2026-11-15T05:00:00Z')
 request.question='Weather from 2026-11-14T12:00 to 2026-11-15T12:00'
 assert.deepEqual(requestWindows(request),{requested:true,windows:[]})
})
test('grid-only dates exclude outside, malformed and null-coverage assumptions',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../shared/copilot/fixtures/phase3-context.json',import.meta.url)))
 const request=structuredClone(fixture.cases.find(c=>c.id==='gust-grid').request)
 request.question='What are wind gusts on 2026-11-16?'
 request.evidence=request.evidence.filter(b=>b.kind!=='forecast')
 const grid=request.evidence.find(b=>b.values.raw?.properties?.windGust)
 const rows=[{validTime:'2026-11-16T04:00:00Z/PT1H',value:99},{validTime:'2026-11-16T05:00:00Z/PT1H',value:null},{validTime:'2026-11-17T05:00:00Z/PT1H',value:88},{validTime:'bad',value:77}]
 grid.values.raw.properties.windGust.values=rows
 grid.values.raw.properties.windSpeed={uom:'fixture',values:[]}
 const before=structuredClone(request),out=buildLocalContext(request,32768)
 const selected=out.selected.find(b=>b.id===grid.id)
 assert.deepEqual(selected.values.series.windGust.values,[rows[1]])
 assert.equal(selected.state.completeness,'partial')
 assert.match(selected.limitations.join(' '),/coverage is unverified/)
 assert.deepEqual(request,before)
 const python=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'streamlit');from copilot_context import build_local_context;print(json.dumps(build_local_context(json.loads(sys.argv[1]),32768)))",JSON.stringify(request)],{encoding:'utf8'}))
 assert.deepEqual(out,python)
})
test('both base system prompts have identical date and unknown-versus-absent rules',()=>{
 const python=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'streamlit');from copilot_prompt import COPILOT_RULES;print(COPILOT_RULES,end='')"],{encoding:'utf8'})
 assert.equal(COPILOT_RULES,python)
 for(const clause of ['request timestamp','requested_windows','unknown, never zero','A precipitation probability is a chance','explicit supplied evidence'])assert.ok(COPILOT_RULES.includes(clause))
})
