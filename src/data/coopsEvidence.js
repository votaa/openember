import coopsPolicy from '../../shared/coops-policy.json' assert {type:'json'}
import config from '../../config/jurisdiction.generated.json' assert {type:'json'}
import {instant,civil,localStamp} from './requestScope.js'
const utc=ms=>new Date(ms).toISOString().replace('.000Z','Z')
export function coopsSnapshots(results=[]) {
  const sources=new Map()
  for(const r of results) {
    const ep=r?.ep||r
    let u;try{u=new URL(ep.url)}catch{continue}
    if(u.hostname!=='api.tidesandcurrents.noaa.gov'||u.pathname!=='/api/prod/datagetter')continue
    const station=config.coops_stations.find(s=>s.id===u.searchParams.get('station'))
    const product=u.searchParams.get('product')
    if(!station||!['water_level','predictions','wind'].includes(product))continue
    const source={id:ep.id||ep.url,url:ep.url,station_id:station.id,station_name:station.name,coordinates:[station.lng,station.lat],role:station.role||'primary',timezone:config.jurisdiction?.timezone||'America/New_York',product,units:u.searchParams.get('units'),datum:u.searchParams.get('datum'),source_timezone:u.searchParams.get('time_zone'),fetched_at:r.fetchedAt||r.fetched_at||null,state:(r.ok??r.success)?'available':'unavailable',data:structuredClone(r.data||{})}
    sources.set(source.id,source)
  }
  return [...sources.values()]
}
export function selectCoops(sources=[],scope,question='') {
  const named=Object.entries(coopsPolicy.station_names).filter(([id,names])=>question.includes(id)||names.some(name=>question.toLowerCase().includes(name.toLowerCase()))).map(([id])=>id)
  const now=instant(scope.request_utc),start=instant(scope.interval?.start_utc),end=instant(scope.interval?.end_utc)
  return sources.map(s=>{
    // Recreate trusted station/product metadata from URL. Client labels cannot change applicability.
    const normalized=coopsSnapshots([{ep:{id:s.id,url:s.url},success:s.state!=='unavailable',data:s.data,fetched_at:s.fetched_at}])[0]
    if(!normalized)return {id:s.id,state:'unavailable',events:[],background:[],facility_applicability:'unknown',limitation:'Unconfigured station or product.'}
    const {data,...out}=normalized
    out.events=[];out.background=[];out.facility_applicability=(scope.facility_linkages||[]).filter(r=>r.station_id===out.station_id).map(r=>`Source ${r.source} documents linkage to ${r.target}: ${r.statement}`).join('; ')||'unknown'
    out.limitation='Station evidence only; facility linkage unknown. Tide predictions are astronomical tides, not surge or total-water-level forecasts. Event samples do not establish continuous coverage or flood likelihood.'
    if(named.length&&!named.includes(out.station_id)){out.state='outside_requested_geography';return out}
    const age=now-instant(out.fetched_at)
    if(!Number.isFinite(age)||age< -300000||age>3600000||s.state==='stale')out.state='stale'
    if(out.state!=='available'||!['english','metric'].includes(out.units)||out.product!=='wind'&&!out.datum)return out
    if(data.metadata?.id&&data.metadata.id!==out.station_id){out.state='unavailable';return out}
    const rows=out.product==='predictions'?data.predictions:data.data
    for(const row of Array.isArray(rows)?rows:[]) {
      if(!row||typeof row!=='object')continue
      let at=instant(row.t)
      if(!Number.isFinite(at)&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.t||'')) {
        if(out.source_timezone==='gmt')at=instant(row.t.replace(' ','T')+':00Z')
        else if(out.source_timezone==='lst_ldt')at=civil(row.t.slice(0,10),row.t.slice(11),out.timezone)
      }
      const fields=out.product==='wind'?{speed:row.s,direction:row.d,gust:row.g}:{height:row.v}
      if(!Number.isFinite(at)||Object.values(fields).some(v=>v===''||v==null||!Number.isFinite(Number(v))))continue
      if(out.product!=='predictions'&&(!['p','v'].includes(row.q)&&out.product==='water_level'||String(row.f||'').split(',').some(v=>Number(v)>0)))continue
      const event={time_utc:utc(at),time_local:localStamp(at,out.timezone),values:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v)])),quality:row.q||null,type:out.product==='predictions'?row.type:null}
      if(out.product==='predictions') {
        if(['H','L'].includes(row.type)&&scope.status==='resolved'&&at>=Math.max(start,now)&&at<end)out.events.push(event)
      } else if(at<=now&&now-at<=coopsPolicy.observation_max_age_seconds*1000) {
        out.background.push(event)
        if(scope.status==='resolved'&&(scope.method==='current_observation'||at>=start&&at<Math.min(end,now+1)))out.events.push(event)
      }
    }
    out.background.sort((a,b)=>a.time_utc.localeCompare(b.time_utc));out.background=out.background.slice(-1)
    return out
  })
}
