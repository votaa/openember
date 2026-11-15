// Server-owned NYS queries. Client URLs, names and claimed jurisdictions never select a source.
import policy from '../../shared/jurisdiction-lookup-policy.json' assert {type:'json'}
import {validateSelectedLocation,selectedLocationQuestion} from './selectedLocation.js'
export {policy as JURISDICTION_LOOKUP_POLICY}

function orientedRing(ring,clockwise) {
  const [x,y]=ring[0]
  const area=ring.slice(1).reduce((sum,p,i)=>sum+(ring[i][0]-x)*(p[1]-y)-(p[0]-x)*(ring[i][1]-y),0)
  if(area===0)throw Error('invalid_query_geometry')
  return (area<0)===clockwise?ring:ring.slice().reverse()
}
export function boundaryQuery(geometry,layer) {
  const c=geometry.coordinates,sr={wkid:4326}
  let type,shape
  if(geometry.type==='Point'){type='esriGeometryPoint';shape={x:c[0],y:c[1]}}
  else if(geometry.type==='MultiPoint'){type='esriGeometryMultipoint';shape={points:c}}
  else if(['LineString','MultiLineString'].includes(geometry.type)){type='esriGeometryPolyline';shape={paths:geometry.type==='LineString'?[c]:c}}
  else if(['Polygon','MultiPolygon'].includes(geometry.type)) {
    type='esriGeometryPolygon'
    const polygons=geometry.type==='Polygon'?[c]:c
    shape={rings:polygons.flatMap(polygon=>polygon.map((ring,i)=>orientedRing(ring,i===0)))}
  } else throw Error('invalid_query_geometry')
  return {f:'json',where:'1=1',geometryType:type,geometry:JSON.stringify({...shape,spatialReference:sr}),inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:layer.fields.join(','),returnGeometry:'false',resultRecordCount:String(policy.max_matches+1),orderByFields:'OBJECTID ASC'}
}
function normalizedMatches(raw,layer) {
  if(!raw||raw.error||!Array.isArray(raw.features)||raw.exceededTransferLimit===true||raw.features.length>policy.max_matches)throw Error('incomplete_or_invalid_response')
  const text=(value,required=false)=>{
    if(value===null||value===undefined){if(required)throw Error('invalid_boundary_record');return null}
    if(typeof value!=='string'||!value.trim()||value.length>256||/[\x00-\x1f\x7f]/.test(value))throw Error('invalid_boundary_record')
    return value.trim()
  }
  const ids=new Set()
  return raw.features.map(feature=>{
    const p=feature?.attributes
    if(!p||!Number.isSafeInteger(p.OBJECTID)||p.OBJECTID<0||ids.has(p.OBJECTID))throw Error('invalid_boundary_record')
    ids.add(p.OBJECTID)
    const name=text(p.NAME,true),fips=text(p.FIPS_CODE,true)
    if(!new RegExp('^\\d{'+({county:5,city_town:10,village:15}[layer.level])+'}$').test(fips))throw Error('invalid_boundary_record')
    const kind=layer.level==='county'?'County':layer.level==='village'?'Village':({town:'Town',city:'City'}[text(p.MUNI_TYPE,true).toLowerCase()])
    if(!['County','Village','Town','City'].includes(kind))throw Error('invalid_boundary_record')
    let modified=null
    if(p.DATEMOD!==null&&p.DATEMOD!==undefined) {
      if(!Number.isSafeInteger(p.DATEMOD)||p.DATEMOD<0||p.DATEMOD>253402300799999||!Number.isFinite(new Date(p.DATEMOD).getTime()))throw Error('invalid_boundary_record')
      modified=new Date(p.DATEMOD).toISOString()
    }
    return {id:String(p.OBJECTID),name,kind,fips,county:text(p.COUNTY),town:text(p.TOWN),source_modified_at:modified}
  }).sort((a,b)=>Number(a.id)-Number(b.id))
}
export function normalizeBoundaryResponse(raw,layer,fetchedAt) {
  const matches=normalizedMatches(raw,layer)
  return {level:layer.level,layer_id:layer.layer_id,source_url:`${policy.service_root}/${layer.layer_id}/query`,fetched_at:fetchedAt,status:matches.length>1?'multiple':matches.length?'matched':'no_match',matches,raw_response:raw}
}
async function boundedJson(response) {
  if(!response.ok)throw Error('boundary_http_error')
  if(Number(response.headers.get('content-length'))>policy.max_response_bytes)throw Error('boundary_response_too_large')
  const reader=response.body.getReader(),chunks=[];let size=0
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>policy.max_response_bytes)throw Error('boundary_response_too_large');chunks.push(value)}
  }finally {await reader.cancel().catch(()=>{})}
  const bytes=new Uint8Array(size);let at=0
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function assembleJurisdiction(levels) {
  const required=levels.filter(l=>l.level!=='village'),failed=levels.some(l=>l.status==='unavailable')
  const hasRequired=required.length===2&&required.every(l=>l.matches.length>0)
  const names=levels.flatMap(l=>l.matches.map(m=>`${m.kind}: ${m.name}`))
  return {version:policy.version,status:hasRequired&&!failed?(levels.some(l=>l.status==='multiple')?'multiple':'matched'):names.length?'partial':'unresolved',names,source:policy.dataset_url,coverage:policy.coverage,publisher:policy.publisher,publication_date:policy.publication_date,relation:'intersects',geometry_reference:'selected_location.location.geometry',containment:'not_evaluated',levels,reason:hasRequired&&!failed?'Mapped administrative intersections returned.':'One or more administrative levels lack complete matching evidence.',limitation:policy.limitation}
}
export async function lookupJurisdiction(selectedLocation,question,{fetchImpl=fetch,clock=()=>new Date().toISOString()}={}) {
  const location=validateSelectedLocation(selectedLocation)
  if(question.trim()!==selectedLocationQuestion(location).trim()||!location.geometry)return {...assembleJurisdiction([]),reason:location.geometry?'Selected location does not match this question.':'Selected geometry is unknown; names and station labels are not geocoded.'}
  const levels=await Promise.all(policy.layers.map(async layer=>{
    const source_url=`${policy.service_root}/${layer.layer_id}/query`
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),policy.timeout_ms)
    try {
      const params=boundaryQuery(location.geometry,layer)
      const response=await fetchImpl(source_url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString(),signal:controller.signal})
      const raw=await boundedJson(response)
      return normalizeBoundaryResponse(raw,layer,clock())
    }catch(error){return {level:layer.level,layer_id:layer.layer_id,source_url,fetched_at:clock(),status:'unavailable',matches:[],reason:controller.signal.aborted?'boundary_timeout':['invalid_query_geometry','incomplete_or_invalid_response','invalid_boundary_record','boundary_response_too_large','boundary_http_error'].includes(error.message)?error.message:'boundary_retrieval_failed'}}
    finally{clearTimeout(timer)}
  }))
  return assembleJurisdiction(levels)
}
