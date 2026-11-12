// UI-owned snapshot construction. URLs are provenance, not server fetch instructions.
export function makeCopilotRequest({question,history=[],name,timezone='America/New_York',enabled=[],forecast=null,layers=[],reports=null,reportSource=null,now=new Date().toISOString()}, adapt) {
  const freshness = (raw,ttl) => { const stamp=raw?.fetched_at || raw?.fetchedAt; const age=Date.parse(now)-Date.parse(stamp); return Number.isFinite(age)&&age>=-60000&&age<=ttl ? 'current':'stale' }
  const source=(id,label,url)=>({id,name:label,url:url||null,provenance:'browser_snapshot'})
  const evidence=[]
  if (forecast) evidence.push(adapt('forecast',forecast,{id:'point_forecast',source:source('point_forecast',forecast.ep?.name || forecast.name || 'NWS point forecast',forecast.ep?.url || forecast.url),geography:name,freshness:freshness(forecast,3600000)}))
  for (const layer of layers) evidence.push(adapt('map_layer',layer,{id:`layer:${layer.id}`,source:source(`layer:${layer.id}`,layer.name,layer.url),geography:name,layer_id:layer.id,freshness:layer.state ? freshness(layer,300000) : 'unknown'}))
  if (reports && reportSource) evidence.push(adapt('reports_311',reports,{id:reportSource.id,source:source(reportSource.id,reportSource.name,reportSource.endpoint),geography:name,filter:reportSource.required_filter,description:'Configured NYC 311 reporting scope; not all Long Island',freshness:freshness(reports,300000)}))
  return {contract_version:'1.0',request_id:globalThis.crypto?.randomUUID?.() || `request-${now}`,question,answer_method:'auto',history:history.slice(-9).map(({role,content})=>({role,content})),jurisdiction:{id:name,name,timezone,enabled_kb_modules:[...enabled]},selection:{geography:null,layer_ids:layers.filter(l=>l.visible!==false).map(l=>l.id),feature_ids:[],source_ids:[]},evidence,requested_at:now}
}
export function withLegacyContext(request,context,adapt) {
  return {...request,evidence:[...request.evidence,adapt('live',{content:context},{id:'legacy_context',source:{id:'legacy_context',name:'Full legacy context',url:null,provenance:'browser_snapshot'},geography:request.jurisdiction.name})]}
}

export function layerCacheKey(layer, geography) {
  return JSON.stringify([layer.id,layer.url,layer.filterMode,layer.where,layer.queryGeometry,layer.visible,layer.filterLoading,layer.filterError,geography])
}
