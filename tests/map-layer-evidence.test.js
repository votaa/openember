import assert from "node:assert/strict"
import test from "node:test"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import {fetchMapLayerEvidence, layerQueryScope, mapLayerContext, summaryField} from "../src/data/mapLayerEvidence.js"
import {fetchArcGISLayer} from "../src/data/esriLayers.js"

const fixture = JSON.parse(readFileSync(new URL("../fixtures/long-island-sources/map-builder-filter-parity.json", import.meta.url)))
const metadata = {capabilities:"Query", objectIdField:"OBJECTID", fields:[
  {name:"OBJECTID",type:"esriFieldTypeOID"}, {name:"COUNTY_NAME",alias:"County",type:"esriFieldTypeString",domain:{codedValues:[{code:1,name:"Nassau"}]}}]}
const layer = {id:"fire",name:"Fire/EMS",url:"https://example.test/FeatureServer/2",metadata,records:Array.from({length:500},()=>({properties:{COUNTY_NAME:1}}))}
function mock({count=900, error=false, groups=null, partial=false}={}) {
  const calls=[]
  return {calls, fetchImpl:async (url, opts) => {
    const params = new URLSearchParams(opts?.body)
    calls.push(Object.fromEntries(params))
    const payload = error ? {error:{message:"upstream failed"}} : params.has("returnCountOnly") ? {count} : {features:groups || [{attributes:{COUNTY_NAME:1,ember_count:count}}],exceededTransferLimit:partial}
    return {ok:true,json:async()=>payload}
  }}
}
test("all add paths ground full inventory separately from capped browse",async()=>{
  for (const entryPath of ["search","quick_add","pasted_url"]) {
    const fetcher=mock()
    const result=await fetchMapLayerEvidence({...layer,entryPath},[],fetcher)
    assert.equal(result.complete_count,900)
    assert.equal(result.displayed_subset,500)
    assert.equal(result.samples.length,3)
    assert.equal(result.samples[0].County,"Nassau")
    assert.equal(fetcher.calls[0].returnCountOnly,"true")
    assert.equal(fetcher.calls[0].resultRecordCount,undefined)
    assert.match(result.unit,/not distinct departments/)
  }
})
test("geography and attribute constraints match source queries in both runtimes",()=>{
  const results = ["unfiltered","operational","pseg_long_island"].map(filterMode =>
    layerQueryScope({...layer,filterMode,where:"ACTIVE=1"}, fixture.geography_records))
  const python=spawnSync("python3",["-c", `import sys,json;sys.path.insert(0,'streamlit');from map_layer_evidence import layer_query_scope; f=json.load(sys.stdin);print(json.dumps([layer_query_scope(dict(url='https://example.test/FeatureServer/2',filter_mode=m,where='ACTIVE=1'),f['geography_records']) for m in ['unfiltered','operational','pseg_long_island']]))`],{input:JSON.stringify(fixture),encoding:"utf8",env:{...process.env,PYTHONPYCACHEPREFIX:"/private/tmp/openember-map-pycache"}})
  assert.equal(python.status,0,python.stderr)
  const normalize=queries=>queries.map(q=>({...q,...(q.geometry?{geometry:JSON.parse(q.geometry)}:{})}))
  assert.deepEqual(normalize(results),normalize(JSON.parse(python.stdout)))
})
test("failed and missing filters, hidden layers and unsupported types never broaden",async()=>{
  for (const update of [{filterError:"failed"},{filterLoading:true},{filterMode:"pseg_long_island"},{visible:false},{url:"https://example.test/MapServer"}]) {
    const fetcher=mock()
    const result=await fetchMapLayerEvidence({...layer,...update},[],fetcher)
    assert.equal(result.state,"unavailable")
    assert.equal(result.complete_count,null)
    assert.equal(fetcher.calls.length,0)
  }
})
test("valid zero is distinct from errors, malformed counts and partial counts",async()=>{
  assert.equal((await fetchMapLayerEvidence(layer,[],mock({count:0}))).complete_count,0)
  for (const options of [{error:true},{count:null},{count:-1},{count:"900"},{count:2.5}]) {
    const result=await fetchMapLayerEvidence(layer,[],mock(options))
    assert.equal(result.state,"unavailable")
    assert.equal(result.complete_count,null)
  }
})
test("summaries use field definitions and labels and reconcile to the complete count",async()=>{
  assert.equal(summaryField(metadata,"Summarize by county").name,"COUNTY_NAME")
  const result=await fetchMapLayerEvidence(layer,[],{...mock(),question:"Summarize by county"})
  assert.deepEqual(result.summary.rows,[{value:"Nassau",count:900}])
  assert.equal(result.summary.state,"complete")
  for (const options of [{partial:true},{groups:[{attributes:{COUNTY_NAME:1,ember_count:3}}]}]) {
    const failed=await fetchMapLayerEvidence(layer,[],{...mock(options),question:"Summarize by county"})
    assert.equal(failed.summary.state,"unavailable")
    assert.equal(failed.summary.rows,undefined)
    assert.equal(failed.complete_count,900)
  }
})
test("refresh queries anew and empty current evidence removes earlier layer claims",async()=>{
  assert.equal((await fetchMapLayerEvidence(layer,[],mock({count:366}))).complete_count,366)
  assert.equal((await fetchMapLayerEvidence(layer,[],mock({count:367}))).complete_count,367)
  assert.match(mapLayerContext([]),/Removed\/hidden layers are unavailable/)
  assert.doesNotMatch(mapLayerContext([]),/Fire\/EMS/)
})
test("a successful empty browse stays loadable",async()=>{
  const result=await fetchArcGISLayer({id:"fire",title:"Fire",url:layer.url},{id:2,url:layer.url,metadata},{fetchImpl:async()=>({ok:true,json:async()=>({features:[]})})})
  assert.equal(result.count,0)
})


test("stale geography and changed source masks withhold exact counts",async()=>{
  const records=fixture.geography_records.map(record=>({...record,data_state:"stale"}))
  const fetcher=mock()
  const result=await fetchMapLayerEvidence({...layer,filterMode:"pseg_long_island"},records,fetcher)
  assert.equal(result.error,"stale_or_partial_geography")
  assert.equal(fetcher.calls.length,0)
  const changed=await fetchMapLayerEvidence({...layer,filterMode:"pseg_long_island",queryGeometry:{rings:[]}},fixture.geography_records,fetcher)
  assert.equal(changed.error,"geography_changed_refresh_filter")
})

test("count responses with a transfer-limit flag cannot establish a total",async()=>{
  const result=await fetchMapLayerEvidence(layer,[],{fetchImpl:async()=>({ok:true,json:async()=>({count:900,exceededTransferLimit:true})})})
  assert.equal(result.state,"unavailable")
  assert.equal(result.complete_count,null)
})
