import {createContextTools} from '../../lib/copilot-context-core.js'
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

// Phase 3 full retained snapshot. Local projection never mutates these source blocks.
export function withSynthesisSnapshot(request,{kb={},files=[],sources=[],apiResults=[],gaugeData={},catalog=[],feature=null,history=[]}={},adapt,policy) {
  const evidence=[...request.evidence], limits=policy.context
  const {sourceNeeded}=createContextTools(policy,()=>({}))
  const omission=(data,needed)=>!needed?'Not needed for this local question; original source data is retained outside the compact request.':new TextEncoder().encode(JSON.stringify(data)).length>limits.source_transfer_bytes?'Source exceeds the 256 KiB compact-transfer limit; original source data is retained outside the compact request.':null
  const source=(id,name,url)=>({id,name,url:url||null,provenance:'browser_snapshot'})
  const base=(id,name,url)=>({id,source:source(id,name,url),geography:request.jurisdiction.name})
  for(const [id,module] of Object.entries(kb)) {
    const enabled=request.jurisdiction.enabled_kb_modules.includes(id)
    const block=adapt('kb',{module_id:id,content:module.data||''},{...base(`kb:${id}`,module.label||id,module.url),availability:enabled?'available':'omitted',omission_reason:enabled?null:'selection'})
    block.values.attribution=module.source||null
    evidence.push(block)
  }
  let remaining=limits.upload_total_bytes
  files.forEach((file,index)=>{
    const id=`document:${index}:${file.name}`, full=file.content||'', size=new TextEncoder().encode(full).length
    const complete=size<=limits.upload_file_bytes&&size<=remaining
    const content=complete?full:Array.from(full).slice(0,4000).join('')
    remaining-=new TextEncoder().encode(content).length
    const block=adapt('document',{...file,content,extraction_partial:!complete},base(id,file.name,null))
    block.values.original_codepoints=Array.from(full).length
    if(!complete)block.limitations.push('Full-upload retrieval limit exceeded (1 MiB per file, 2 MiB total). Existing opening excerpt retained; split or narrow the upload.')
    evidence.push(block)
  })
  for(const item of sources) {
    const result=item.result||item, ep=result.ep||item.ep||{}
    if(['nws_forecast','nws_forecast_li'].includes(ep.id)&&request.evidence.some(b=>b.kind==='forecast'))continue
    const id=`noaa:${ep.id||evidence.length}`,stamp=result.fetched_at||result.fetchedAt, age=Date.parse(request.requested_at)-Date.parse(stamp)
    const contentOmitted=omission(result.data??null,sourceNeeded(ep,request))
    const block=adapt('live',{fetched_at:stamp,ok:result.ok,success:result.success,error:result.error,raw:contentOmitted?null:result.data??null,content:contentOmitted?'':item.content||'',category:item.category||ep.id||'live'}, {...base(id,ep.name||item.name||id,result.url||ep.url||item.url),freshness:Number.isFinite(age)&&age>=-60000&&age<=(item.ttl_seconds||3600)*1000?'current':'stale'})
    block.values={raw:contentOmitted?null:result.data??null,content:contentOmitted?'':item.content||'',category:item.category||ep.id||'live',content_omitted:contentOmitted}
    block.state.completeness=(result.ok||result.success)?'complete':'unknown'
    if(item.pending) {block.state.availability='omitted';block.state.omission_reason='budget';block.limitations.push('Not acquired for this local question; source availability is unverified.')}
    evidence.push(block)
  }
  apiResults.forEach((result,index)=>{const id=`api:${index}`,reason=omission(result,sourceNeeded({name:result.name,tags:[result.type||'']},request));const block=adapt('live',reason?{fetchedAt:result.fetchedAt,success:result.success,content_omitted:reason}:result,base(id,result.name||id,result.url));evidence.push(block)})
  for(const [id,value] of Object.entries(gaugeData))evidence.push(adapt('live',value,base(`gauge:${id}`,`CO-OPS ${id}`,value.url)))
  catalog.forEach((value,index)=>{const reason=omission(value,sourceNeeded({name:value.name||'Saved catalog metadata',tags:['catalog']},request));const block=adapt('catalog',reason?{content:''}:value,base(`catalog:${index}`,value.name||'Saved catalog metadata',value.url));if(reason)block.values.content_omitted=reason;evidence.push(block)})
  const selection={...request.selection,feature_ids:[]}
  if(feature){const id='selected_feature';evidence.push(adapt('selected_feature',feature,base(id,feature.sourceName||feature.source_name||'Selected map feature',feature.source_url)));selection.feature_ids.push(id)}
  const scopedHistory=history.length?history.slice(-9).map(m=>({role:m.role,content:m.content,...(m.role==='assistant'?{scope_key:m.response?.context?.scope_key||null}:{})})):request.history
  return {...request,context_version:'1.0',history:scopedHistory,evidence,selection}
}
