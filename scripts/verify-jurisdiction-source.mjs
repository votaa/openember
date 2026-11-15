// Read-only verification of the public configured NYS source. Never calls a model.
import {mkdirSync,writeFileSync} from 'node:fs'
import {lookupJurisdiction} from '../src/data/jurisdictionLookup.js'
import {selectedLocationFromFeature,selectedLocationQuestion} from '../src/data/selectedLocation.js'
const output=new URL('../docs/long-island/acceptance/boundary-local-2026-11-15/live-source-results.json',import.meta.url)
const cases=[
 {id:'kfrg',name:'KFRG — Republic Airport',station_id:'KFRG',geometry:{type:'Point',coordinates:[-73.4134,40.7288]}},
 {id:'hospital',name:'Hospital map point',geometry:{type:'Point',coordinates:[-73.6993,40.7765]}},
 {id:'crossing_road',name:'Synthetic crossing road',geometry:{type:'LineString',coordinates:[[-73.5,40.75],[-73.3,40.75]]}},
 {id:'crossing_area',name:'Synthetic crossing polygon',geometry:{type:'Polygon',coordinates:[[[-73.5,40.74],[-73.3,40.74],[-73.3,40.76],[-73.5,40.76],[-73.5,40.74]]]}},
 {id:'water_point',name:'Coastal water point',geometry:{type:'Point',coordinates:[-73.2,40.6]}},
 {id:'sparse',name:'Ambiguous place'}
]
const records=[]
for(const feature of cases) {
 const location=selectedLocationFromFeature(feature),start=Date.now()
 const result=await lookupJurisdiction(location,selectedLocationQuestion(location))
 records.push({case:feature.id,location,result,elapsed_ms:Date.now()-start})
 console.log(JSON.stringify({case:feature.id,status:result.status,names:result.names,elapsed_ms:records.at(-1).elapsed_ms,failures:result.levels.filter(l=>l.status==='unavailable').map(l=>l.reason)}))
}
mkdirSync(new URL('./',output),{recursive:true})
writeFileSync(output,JSON.stringify({captured_at:new Date().toISOString(),provenance:'Live public NYS boundary queries; no cloud model calls or hosted app acceptance.',records},null,2)+'\n')
if(records.slice(0,4).some(r=>!['matched','multiple'].includes(r.result.status)))throw Error('Required source case did not resolve')
