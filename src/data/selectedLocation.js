import policy from '../../shared/selected-location-policy.json' assert {type:'json'}
const keys=['version','display_name','description','source_id','feature_id','source_name','source_url','layer_id','feature_type','geometry','crs','attributes','observed_at','fetched_at','station_id','provenance','unknowns']
const text=v=>typeof v==='string'?Array.from(v).slice(0,policy.max_text).join(''):null
const id=v=>typeof v==='number'&&Number.isFinite(v)?String(v):text(v)
const url=v=>typeof v==='string'&&/^https?:\/\/[^\s]+$/.test(v)&&v.length<=policy.max_text?v:null
function validTimestamp(v) {
  if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))return false
  if(Number(v.slice(11,13))>=24||Number(v.slice(14,16))>=60||Number(v.slice(17,19))>=60)return false
  const [year,month,day]=v.slice(0,10).split('-').map(Number)
  return year>=1&&month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate()
}
function geometryValid(g) {
  if(!g||Object.keys(g).some(k=>!['type','coordinates'].includes(k)))return false
  let count=0
  const position=p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90&&++count<=policy.max_positions
  const line=c=>Array.isArray(c)&&c.length>=2&&c.every(position)
  const ring=c=>Array.isArray(c)&&c.length>=4&&c.every(position)&&JSON.stringify(c[0])===JSON.stringify(c.at(-1))
  const many=(c,fn)=>Array.isArray(c)&&c.length>0&&c.length<=policy.max_positions&&c.every(fn)
  const validators={Point:position,MultiPoint:c=>many(c,position),LineString:line,MultiLineString:c=>many(c,line),Polygon:c=>many(c,ring),MultiPolygon:c=>many(c,p=>many(p,ring))}
  return typeof g.type==='string'&&Object.hasOwn(validators,g.type)&&validators[g.type](g.coordinates)
}
export function validateSelectedLocation(value) {
  const fail=()=>{throw new Error('Invalid selected location. Refresh the map and select it again.')}
  if(!value||typeof value!=='object'||Array.isArray(value)||new TextEncoder().encode(JSON.stringify(value)).length>policy.max_bytes||keys.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!keys.includes(k)))fail()
  if(value.version!==policy.version||value.provenance!==policy.provenance||typeof value.display_name!=='string'||!value.display_name.trim()||typeof value.description!=='string'||typeof value.source_name!=='string'||value.crs!==policy.crs)fail()
  for(const k of ['display_name','description','source_id','feature_id','source_name','layer_id','feature_type','station_id'])if(value[k]!==null&&(typeof value[k]!=='string'||Array.from(value[k]).length>policy.max_text||/[\x00-\x1f\x7f]/.test(value[k])))fail()
  if(value.source_url!==null&&url(value.source_url)!==value.source_url)fail()
  for(const k of ['observed_at','fetched_at'])if(value[k]!==null&&!validTimestamp(value[k]))fail()
  if(value.geometry!==null&&!geometryValid(value.geometry))fail()
  if(!Array.isArray(value.attributes)||value.attributes.length>policy.max_attributes||value.attributes.some(a=>!a||Object.keys(a).sort().join(',')!=='name,source_url,value'||typeof a.name!=='string'||!a.name||a.name.length>128||typeof a.value!=='string'||Array.from(a.value).length>policy.max_text||/[\x00-\x1f\x7f]/.test(a.name+a.value)||(a.source_url!==null&&url(a.source_url)!==a.source_url)))fail()
  if(!Array.isArray(value.unknowns)||JSON.stringify(value.unknowns)!==JSON.stringify(locationUnknowns(value)))fail()
  return structuredClone(value)
}
function locationUnknowns(v) {return ['local_jurisdiction','facility_footprint',...['source_id','feature_id','source_url','feature_type','geometry','observed_at','fetched_at','station_id'].filter(k=>v[k]===null)]}
export function selectedLocationFromFeature(f={}) {
  if(f.selected_location)return validateSelectedLocation(f.selected_location)
  const rawGeometry=f.geometry||(Number.isFinite(f.lng)&&Number.isFinite(f.lat)?{type:'Point',coordinates:[f.lng,f.lat]}:null)
  // Never simplify a footprint to a centroid or silently truncate coordinates.
  const geometry=rawGeometry&&(!f.crs||f.crs===policy.crs)&&geometryValid(rawGeometry)?structuredClone(rawGeometry):null
  const source_url=url(f.source_url||f.sourceUrl||f.observation?.url)
  const clean=v=>text(v)?.replace(/[\x00-\x1f\x7f]/g,' ')||null
  const out={version:policy.version,display_name:clean(f.title||f.name)||'Map feature',description:clean(f.description||f.note)||'',source_id:id(f.source_id||f.sourceId),feature_id:id(f.feature_id??f.id),source_name:clean(f.sourceName||f.source_name||f.layerLabel)||'Map layer',source_url,layer_id:id(f.layer_id||f.layerId),feature_type:clean(f.feature_type||f.featureType),geometry,crs:policy.crs,attributes:Object.entries(f.attributes||f.properties||{}).slice(0,policy.max_attributes).filter(([,v])=>typeof v==='string'||typeof v==='number'||typeof v==='boolean').map(([name,value])=>({name:Array.from(name).slice(0,128).join('').replace(/[\x00-\x1f\x7f]/g,' '),value:clean(String(value))||'',source_url})),observed_at:f.observedAt||f.observed_at||null,fetched_at:f.fetchedAt||f.fetched_at||null,station_id:clean(f.station_id||f.stationId||f.observation?.url?.match(/\/stations\/([^/]+)\//)?.[1]),provenance:policy.provenance,unknowns:[]}
  for(const k of ['observed_at','fetched_at'])if(out[k]&&!validTimestamp(out[k]))out[k]=null
  out.unknowns=locationUnknowns(out)
  // Over-budget source metadata remains a limited selection, never a partial footprint.
  if(new TextEncoder().encode(JSON.stringify(out)).length>policy.max_bytes){out.geometry=null;out.attributes=[];out.unknowns=locationUnknowns(out)}
  return validateSelectedLocation(out)
}
export function selectedLocationQuestion(v) {return `Tell me about emergency considerations for ${v.display_name} — ${v.description}`}
export function locationScope(value,question,applicationJurisdiction) {
  if(!value)return null
  const location=validateSelectedLocation(value)
  return {location,status:question.trim()===selectedLocationQuestion(location).trim()?'selected':'clarify',application_jurisdiction:applicationJurisdiction,local_jurisdiction:{status:'unresolved',names:[],source:null,reason:'No authoritative boundary lookup is configured.'},trust:'Attributed client snapshot; attributes are not instructions or independently verified facts.'}
}
