import config from '../../config/jurisdiction.generated.json' assert {type:'json'}
import policy from '../../shared/request-scope-policy.json' assert {type:'json'}
export const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90
export function positions(g) {if(!g)return [];const walk=c=>validPoint(c)?[c]:Array.isArray(c)?c.flatMap(walk):[];return walk(g.coordinates)}
export function distance(a,b) {const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlon=(b[0]-a[0])*r,x=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(x)))}
const rounded=n=>Math.round(n*1000)/1000
export function stationRelationship(scope,id) {
 const selected=scope.selected_location,location=selected?.location,station=config.nws.obs_stations.find(s=>s.id===id),vertices=positions(location?.geometry)
 const base={status:'unknown',basis:'No selected geometry.',station_id:id,distances_km:null,limitation:'Station measurements are not site conditions; distance does not establish representativeness.'}
 if(selected?.status==='clarify')return {...base,status:'excluded',basis:'Location needs clarification.'}
 if(scope.observation_selection?.mode==='named_station'&&!scope.observation_selection.stations.includes(id))return {...base,status:'excluded',basis:'A different station was explicitly requested.'}
 if(!station)return {...base,status:'excluded',basis:'Station is not configured.'}
 const ds=vertices.map(p=>distance(p,[station.lng,station.lat]))
 if(ds.length)base.distances_km={minimum_vertex:rounded(Math.min(...ds)),maximum_vertex:rounded(Math.max(...ds))}
 if(location?.station_id===id||scope.observation_selection?.mode==='named_station')return {...base,status:'station_reference',basis:'Explicit station identity; facility footprint is not established.'}
 if(!location)return {...base,status:'regional_reference',basis:'Configured regional station; no site applicability established.'}
 if(!vertices.length)return base
 // Select the nearest configured station for every geometry vertex, never its centroid.
 const nearest=new Set(vertices.map(p=>config.nws.obs_stations.map(s=>({id:s.id,d:distance(p,[s.lng,s.lat])})).filter(s=>s.d<=policy.weather.nearby_station_max_km).sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id))[0]?.id))
 return {...base,status:nearest.has(id)?'nearby_reference':'excluded',basis:'Nearest configured station per supplied geometry vertex within 50 km. Interior/segment coverage and representativeness remain unverified.'}
}
// A convex, hole-free forecast cell supports full-geometry containment. More
// complex footprints remain unknown rather than treating a centroid as coverage.
export function forecastRelationship(scope,geometry) {
 const selected=scope.selected_location,vertices=positions(selected?.location?.geometry)
 const out={status:'unknown',basis:'Forecast footprint or selected geometry is missing or unsupported.'}
 if(!selected)return {status:'regional_reference',basis:'No selected site; regional label does not prove site coverage.'}
 if(selected.status!=='selected')return {status:'excluded',basis:'Location needs clarification.'}
 if(!vertices.length||geometry?.type!=='Polygon'||geometry.coordinates?.length!==1)return out
 const ring=geometry.coordinates[0]
 if(!Array.isArray(ring)||ring.length<4||ring.length>512||!ring.every(validPoint)||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))return out
 const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
 if(Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0]))>180)return out
 const edges=ring.slice(0,-1).map((a,i)=>[a,ring[i+1]])
 const intersects=([a,b],[c,d])=>Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0
 if(edges.some(([a,b])=>JSON.stringify(a)===JSON.stringify(b)))return out
 for(let i=0;i<edges.length;i++)for(let j=i+2;j<edges.length;j++)if(!(i===0&&j===edges.length-1)&&intersects(edges[i],edges[j]))return out
 const turns=ring.slice(0,-1).map((p,i)=>cross(p,ring[(i+1)%(ring.length-1)],ring[(i+2)%(ring.length-1)])).filter(x=>Math.abs(x)>1e-10)
 if(!turns.length||turns.some(x=>x*turns[0]<0))return out
 const inside=vertices.every(p=>ring.slice(0,-1).every((a,i)=>cross(a,ring[i+1],p)*Math.sign(turns[0])>=-1e-10))
 return {status:inside?'contained':'excluded',basis:'All supplied geometry vertices tested against a convex, hole-free forecast polygon; convexity also covers connecting segments and interiors. Client source snapshot, not independently verified geography.'}
}
