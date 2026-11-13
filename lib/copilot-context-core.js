import {contextForecastPeriods} from './copilot-forecast.js'
// Shared pure projection/retrieval. No provider, network or filesystem access.
export function createContextTools(POLICY, inputEstimate, groundingRules='') {
  const cfg=POLICY.context
  const chars=text=>Array.from(text)
  const canonical=value=>JSON.stringify(sort(value))
  function sort(value) { return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value }
  function terms(text) { return [...new Set((text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(t=>t.length>1&&!cfg.stopwords.includes(t)).map(t=>cfg.aliases[t]||t))] }
  function needs(request) {
    const recent=request.history.filter(m=>m.role==='user').slice(-2).map(m=>m.content).join(' ')
    const text=request.question+' '+(/^what about\b/i.test(request.question)?recent:'')
    const knowledgeOnly=new RegExp(cfg.knowledge_only,'i').test(text)&&!new RegExp(cfg.live_scope,'i').test(text)
    return {broad:!knowledgeOnly&&new RegExp(cfg.broad,'i').test(text),...Object.fromEntries(Object.entries(cfg.topics).map(([k,p])=>[k,!knowledgeOnly&&new RegExp(p,'i').test(text)]))}
  }
  function sourceNeeded(ep,request) {
    if(ep.enabled===false)return false
    const demand=needs(request),text=request.question.toLowerCase(),id=(ep.id||'').toLowerCase(),label=[ep.name,ep.cat,...(ep.tags||[])].join(' ').toLowerCase()
    if(demand.broad)return !/catalog|dataset|metadata|ncei/.test(id+' '+label)
    if(demand.weather&&/forecast/.test(id)&&!/hourly|hrly/.test(id))return true
    if(demand.weather&&/hour/.test(text)&&/hourly|hrly/.test(id))return true
    if(/gust|rainfall|rain amount|precipitation amount/.test(text)&&/grid/.test(id))return true
    if(/observed|observation|metar|current wind/.test(text)&&/obs|metar/.test(id))return true
    if(demand.water&&/coops|co-ops|usgs|tide|water/.test(id+' '+label))return true
    return terms(text).some(t=>terms(label).includes(t))
  }
  function scopeKey(request) {
    const text=canonical({kb:request.evidence.filter(b=>b.kind==='kb'&&request.jurisdiction.enabled_kb_modules.includes(b.values.module_id)).map(b=>[b.values.module_id,b.values.content]),selection:request.selection,features:request.evidence.filter(b=>b.kind==='selected_feature').map(b=>b.values),visibility:request.evidence.filter(b=>['map_layer','document'].includes(b.kind)).map(b=>[b.id,b.state.availability,{filter:b.scope.filter||'unfiltered',where:b.scope.where||'1=1',layer_id:b.scope.layer_id}])})
    let hash=2166136261
    for(const byte of new TextEncoder().encode(text)) hash=Math.imul(hash^byte,16777619)>>>0
    return 'scope-'+hash.toString(16).padStart(8,'0')
  }
  function conversation(request) {
    const key=scopeKey(request), warnings=[]
    const restricted=request.evidence.some(b=>b.kind==='kb'&&!request.jurisdiction.enabled_kb_modules.includes(b.values.module_id)||b.kind==='map_layer'&&['hidden','omitted'].includes(b.state.availability))
    const history=request.history.filter(m=>{const keep=m.role!=='assistant'||(m.scope_key?m.scope_key===key:!restricted);if(!keep)warnings.push('Prior assistant prose from a different KB or source selection was excluded.');return keep}).map(({role,content})=>({role,content}))
    return {history,warnings:[...new Set(warnings)],key}
  }
  function retrieve(block, question) {
    const wanted=terms(question), chunks=[]
    for(const passage of block.values.passages) {
      const text=chars(passage.text)
      for(let start=0;start<text.length;start+=cfg.document_chunk_chars) {
        const content=text.slice(start,start+cfg.document_chunk_chars).join('')
        const words=terms(content), score=wanted.filter(t=>words.includes(t)).length
        chunks.push({id:`${block.id}:${passage.start+start}-${passage.start+Math.min(start+cfg.document_chunk_chars,text.length)}`,start:passage.start+start,end:passage.start+Math.min(start+cfg.document_chunk_chars,text.length),text:content,score})
      }
    }
    const ranked=chunks.map((p,index)=>({...p,index})).sort((a,b)=>b.score-a.score||a.index-b.index)
    const selected=new Set()
    for(const p of ranked.filter(p=>p.score>0).slice(0,2)) for(let i=Math.max(0,p.index-cfg.document_neighbor_chunks);i<=Math.min(chunks.length-1,p.index+cfg.document_neighbor_chunks);i++) selected.add(i)
    if(!selected.size&&chunks.length) {selected.add(0);if(chunks.length>1)selected.add(chunks.length-1)}
    const passages=[...selected].sort((a,b)=>a-b).slice(0,cfg.document_chunks_per_source).map(i=>{const {score,...passage}=chunks[i];return passage})
    return {passages,coverage:passages.reduce((n,p)=>n+p.end-p.start,0)===chunks.reduce((n,p)=>n+p.end-p.start,0)&&block.state.completeness==='complete'?'full':'selected passages only'}
  }
  function header(block) {return structuredClone({id:block.id,kind:block.kind,source:block.source,fetched_at:block.fetched_at,valid_interval:block.valid_interval,geography:block.geography,scope:block.scope,state:block.state,limitations:block.limitations})}
  function projection(block, request, intent) {
    const out=header(block)
    if(block.kind==='document') out.values=retrieve(block,request.question)
    else if(block.kind==='map_layer') out.values={complete_count:block.values.complete_count,unit:block.values.unit,samples:(block.values.samples||[]).slice(0,3),summary:block.values.summary}
    else if(block.kind==='forecast') {
      const text=request.question.toLowerCase(), named=/tonight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.exec(text)?.[0]
      const fields=/\blow\b/.test(text)?['low']:/\bhigh\b/.test(text)?['high']:['temperature']
      let periods=block.values.periods||[]
      // Planning-resolved intervals are authoritative; the application can attach them below.
      const exact=intent?.operations.filter(op=>op.intent==='forecast_facts'&&op.status==='ready').map(op=>op.scope.interval)||[]
      if(exact.length) periods=periods.filter(p=>exact.some(i=>Date.parse(p.startTime)>=Date.parse(i.start)&&Date.parse(p.endTime)<=Date.parse(i.end)))
      else if(named) {
        periods=contextForecastPeriods(request,periods)
        if(!periods.length) {out.limitations.push('Requested forecast period is outside supplied point-forecast coverage.');out.state.completeness='partial'}
      }
      out.values={periods:periods.map(p=>Object.fromEntries(['name','isDaytime','startTime','endTime','temperature','temperatureUnit','windSpeed','windDirection','detailedForecast','shortForecast','probabilityOfPrecipitation'].filter(k=>k in p).map(k=>[k,p[k]])))}
    } else if(block.kind==='live' && block.values.raw?.properties && ['windGust','windSpeed','quantitativePrecipitation','probabilityOfPrecipitation'].some(key=>block.values.raw.properties[key]?.values)) {
      const properties=block.values.raw.properties, windows=contextForecastPeriods(request,request.evidence.filter(b=>b.kind==='forecast').flatMap(b=>b.values.periods||[]))
      const fields=/gust/i.test(request.question)?['windGust','windSpeed']:/rainfall|rain amount/i.test(request.question)?['quantitativePrecipitation']:['windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation']
      const series={}
      for(const key of fields) {
        if(!properties[key])continue
        const values=properties[key].values||[]
        const matching=windows.length?values.filter(row=>{const [stamp,duration]=String(row.validTime||'').split('/');const match=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration||'');if(!match)return true;const start=Date.parse(stamp),end=start+(Number(match[1]||0)*86400+Number(match[2]||0)*3600+Number(match[3]||0)*60+Number(match[4]||0))*1000;return windows.some(p=>start<Date.parse(p.endTime)&&end>Date.parse(p.startTime))}):values
        out.state.completeness='partial';out.limitations.push('Grid series: requested-window coverage is unverified; missing or null intervals must not be treated as zero or used to assert a full-window maximum or total.')
        series[key]={uom:properties[key].uom||null,values:matching.slice(0,48),coverage:matching.length>48?'first 48 matching intervals only':'all matching supplied intervals'}
        if(matching.length>48) {out.state.completeness='partial';out.limitations.push('Grid intervals capped; do not extrapolate full-window maxima or totals.')}
      }
      out.values={series}
    } else out.values=block.values
    return out
  }
  function buildLocalContext(request,allocatedContext,intent=null,deterministic='') {
    const demand=needs(request), convo=conversation(request), warnings=[...convo.warnings], omitted=[], required=[], optional=[]
    for(const block of request.evidence) {
      if(block.id==='legacy_context') continue
      if(block.values.content_omitted){omitted.push({id:block.id,reason:block.values.content_omitted});continue}
      if(block.kind==='kb') {
        if(request.jurisdiction.enabled_kb_modules.includes(block.values.module_id)&&block.state.availability==='available') required.push({...header(block),values:block.values})
        else omitted.push({id:block.id,reason:'disabled or excluded KB module'})
        continue
      }
      if(['hidden','omitted'].includes(block.state.availability)) {omitted.push({id:block.id,reason:block.state.omission_reason==='budget'?'processing budget omission':'not visible in current selection'});continue}
      if(block.kind==='selected_feature') {required.push(projection(block,request,intent));continue}
      const text=block.source.name+' '+block.kind+' '+canonical(block.values), words=terms(text)
      const requested=request.selection.source_ids.includes(block.source.id)||(demand.maps||demand.broad)&&request.selection.layer_ids.includes(block.scope.layer_id)
      const relevant=block.kind==='live'&&sourceNeeded({id:block.source.id,name:block.source.name,tags:[block.values.category||'']},request)||requested||demand.broad||block.kind==='document'||block.kind==='map_layer'&&demand.maps||block.kind==='forecast'&&demand.weather||terms(request.question).some(t=>words.includes(t))
      if(!relevant) {omitted.push({id:block.id,reason:'not needed for this question'});continue}
      const projected=projection(block,request,intent)
      if(block.kind==='document'&&block.state.completeness!=='complete')warnings.push(...block.limitations)
      if(block.kind==='document'&&projected.values.coverage!=='full')warnings.push(`${block.source.name}: only selected document passages are included.`)
      if(chars(canonical(projected)).length>cfg.per_source_chars) {omitted.push({id:block.id,reason:'source exceeds the per-source processing budget; narrow the requested fields or period'});continue}
      optional.push(projected)
    }
    const missing=request.jurisdiction.enabled_kb_modules.filter(id=>!required.some(b=>b.kind==='kb'&&b.values.module_id===id))
    for(const id of missing)warnings.push(`Enabled KB module ${id} is missing from the snapshot; it was not disabled by the selector.`)
    // Give each candidate source a share before admitting large optional evidence.
    const share=Math.min(cfg.per_source_chars,Math.floor(cfg.optional_context_chars/Math.max(1,optional.length)))
    for(const source of optional) if(source.kind==='document') {
      while(chars(canonical(source)).length>share && source.values.passages.length>1) {
        const ranked=source.values.passages.map((p,index)=>({index,score:terms(request.question).filter(t=>terms(p.text).includes(t)).length})).sort((a,b)=>a.score-b.score||b.index-a.index)
        source.values.passages.splice(ranked[0].index,1);source.values.coverage='selected passages only'
      }
    }
    const included=[...required]
    const makeMessages=()=>[{role:'system',content:`Grounded local synthesis · ${cfg.prompt_version}\n${cfg.rules}\n${groundingRules}\nJurisdiction: ${request.jurisdiction.name}\nAll enabled KB modules: ${canonical(request.jurisdiction.enabled_kb_modules)}\nEVIDENCE:\n${included.map(canonical).join('\n')}\nDETERMINISTIC RESULTS:\n${deterministic}\nCOVERAGE:\n${canonical({included:included.map(b=>b.id),omitted,warnings})}`},...convo.history,{role:'user',content:request.question}]
    let accounting=inputEstimate(makeMessages(),allocatedContext)
    let optionalChars=0
    for(const source of optional) {
      const size=chars(canonical(source)).length
      if(optionalChars+size>cfg.optional_context_chars) {omitted.push({id:source.id,reason:'total optional-evidence processing budget'});continue}
      included.push(source)
      const check=inputEstimate(makeMessages(),allocatedContext)
      if(!check.fits_estimate) {included.pop();omitted.push({id:source.id,reason:'local input capacity after mandatory KB/question/history and output reserve'})}
      else optionalChars+=size
    }
    while(!inputEstimate(makeMessages(),allocatedContext).fits_estimate&&included.length>required.length){const source=included.pop();omitted.push({id:source.id,reason:'input capacity including source coverage metadata'})}
    const messages=makeMessages();accounting=inputEstimate(messages,allocatedContext)
    const processingLimit=missing.length?'An enabled KB module is missing from the retained snapshot; full KB-backed synthesis cannot be verified.':!accounting.fits_estimate?'Mandatory enabled KB, question, history or required feature evidence exceeds the safe local input capacity. No mandatory evidence was discarded.':null
    return {messages,context:{policy:'local_bounded',prompt_version:cfg.prompt_version,scope_key:convo.key,included_ids:included.map(b=>b.id),omitted:omitted.map(item=>({...item,source_name:request.evidence.find(b=>b.id===item.id)?.source.name||item.id})),warnings,accounting,processing_limit:processingLimit,enabled_kb_modules:[...request.jurisdiction.enabled_kb_modules]},selected:included}
  }
  return {needs,sourceNeeded,scopeKey,conversation,retrieve,buildLocalContext,canonical}
}
