// Prepare a predetermined matrix from one retained public session; no model calls.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {JURISDICTION} from '../src/config/jurisdiction.js'
import {weatherSnapshots,resolveRequestScope,instant} from '../src/data/requestScope.js'
const session=resolve(process.argv[2])
if(existsSync(join(session,'matrix.json')))throw Error('Matrix already exists; do not overwrite acceptance attempts.')
const sources=JSON.parse(readFileSync(join(session,'sources/weather-capture.json')))
if(sources.some(r=>!Number.isFinite(instant(r.fetchedAt))))throw Error('Capture metadata must use the production millisecond timestamp contract before any model call.')
const scope=resolveRequestScope({question:'tonight',requestedAt:new Date().toISOString(),jurisdiction:JURISDICTION,weather:weatherSnapshots(sources,JURISDICTION)})
if(scope.status!=='resolved')throw Error('Current source-defined night is not resolved')
writeFileSync(join(session,'preparation-scope.json'),JSON.stringify(scope,null,2)+'\n')
const original=resolve('tests/fixtures/uploads/synthetic-plan.txt')
const fixture=readFileSync('tests/fixtures/corrective/positive-plan.md','utf8').replaceAll('2026-11-14T23:00:00Z',scope.interval.start_utc).replaceAll('2026-11-15T11:00:00Z',scope.interval.end_utc)
const positive=join(session,'positive-plan.md');writeFileSync(positive,fixture)
const conflict=join(session,'conflicting-plan.md');writeFileSync(conflict,fixture+'\n\n'+fixture.replaceAll('Casey Example','Morgan Example').replaceAll('10 ft','11 ft').replaceAll('"value":10','"value":11').replaceAll('use DELTA-19 for those check-ins','use ECHO-20 for those check-ins'))
const question="Using the uploaded plan and enabled KB, explain tonight's weather impacts on this facility. Include CEDAR-731, amber cones, radio channel and incident commander. Give the low, wind and exact forecast URL; distinguish facts from possible impacts."
const matrix=[]
for(const [scenario,upload]of [['missing',original],['supplied',positive],['conflicting',conflict]])for(let repeat=1;repeat<=3;repeat++)matrix.push({id:scenario+'-0'+repeat,scenario,repeat,upload,question})
for(const [id,q]of [
 ['rolling-24h','Using the uploaded plan and enabled KB, assess the next 24 hours for CEDAR-731. State the exact window, supplied wind and temperature evidence, commander, deployed equipment and authorized procedures.'],
 ['later-date','Using the uploaded plan and enabled KB, assess November 18, 2026 for CEDAR-731. State the exact window, source coverage, wind and temperature evidence and known gaps.'],
 ['named-station','At Kings Point, distinguish current observed water levels from tonight’s tide predictions. State timestamps, units, datum, coverage and whether this establishes CEDAR-731 flood likelihood.'],
 ['current-conditions','Using the plan and enabled sources, describe current measured conditions at the supplied stations, with timestamps, units, location and missing evidence. Do not substitute forecasts for observations.'],
 ['missing-sources',question],['stale-sources',question]
])matrix.push({id,scenario:id,repeat:1,upload:original,question:q})
for(const row of matrix){
 const dir=join(session,row.id);mkdirSync(dir,{recursive:true})
 const variant=structuredClone(sources)
 if(row.scenario==='missing-sources')for(const s of variant){s.ok=false;s.error='Acceptance variant: original retained snapshot intentionally unavailable';s.data={}}
 if(row.scenario==='stale-sources')for(const s of variant)s.fetchedAt=new Date(Date.parse(s.fetchedAt)-7200000).toISOString()
 writeFileSync(join(dir,'weather-capture.json'),JSON.stringify(variant,null,2)+'\n')
 row.directory=dir
}
writeFileSync(join(session,'matrix.json'),JSON.stringify(matrix,null,2)+'\n')
console.log(JSON.stringify({cases:matrix.length,scope:scope.interval,source_count:sources.length},null,2))
