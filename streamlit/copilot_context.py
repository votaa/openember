"""Provider-specific grounded context; pure selection, retrieval and accounting."""
import copy
import json
import re
from copilot_contract import POLICY, input_estimate
from copilot_prompt import COPILOT_RULES
from copilot_forecast import context_forecast_periods

CFG = POLICY['context']


def canonical(value):
    def normalized(v):
        if isinstance(v, dict): return {k: normalized(x) for k,x in v.items()}
        if isinstance(v, list): return [normalized(x) for x in v]
        if type(v) is float and v.is_integer(): return int(v)
        return v
    return json.dumps(normalized(value),sort_keys=True,ensure_ascii=False,separators=(',',':'))


def terms(text):
    return list(dict.fromkeys(CFG['aliases'].get(t,t) for t in re.findall('[a-z0-9]+',text.lower()) if len(t)>1 and t not in CFG['stopwords']))


def needs(request):
    recent=' '.join(m['content'] for m in [m for m in request['history'] if m['role']=='user'][-2:])
    text=request['question']+' '+(recent if re.match(r'what about\b',request['question'],re.I) else '')
    knowledge_only=bool(re.search(CFG['knowledge_only'],text,re.I)) and not re.search(CFG['live_scope'],text,re.I)
    return dict(broad=not knowledge_only and bool(re.search(CFG['broad'],text,re.I)),**{k:not knowledge_only and bool(re.search(p,text,re.I)) for k,p in CFG['topics'].items()})


def source_needed(ep,request):
    if ep.get('enabled') is False:return False
    demand=needs(request);text=request['question'].lower();id=ep.get('id','').lower();label=' '.join([ep.get('name',''),ep.get('cat','')]+ep.get('tags',[])).lower()
    if demand['broad']:return not re.search('catalog|dataset|metadata|ncei',id+' '+label)
    if demand['weather'] and 'forecast' in id and not re.search('hourly|hrly',id):return True
    if demand['weather'] and 'hour' in text and re.search('hourly|hrly',id):return True
    if re.search('gust|rainfall|rain amount|precipitation amount',text) and 'grid' in id:return True
    if re.search('observed|observation|metar|current wind',text) and re.search('obs|metar',id):return True
    if demand['water'] and re.search('coops|co-ops|usgs|tide|water',id+' '+label):return True
    return any(t in terms(label) for t in terms(text))


def scope_key(request):
    text=canonical(dict(kb=[[b['values']['module_id'],b['values']['content']] for b in request['evidence'] if b['kind']=='kb' and b['values']['module_id'] in request['jurisdiction']['enabled_kb_modules']],selection=request['selection'],features=[b['values'] for b in request['evidence'] if b['kind']=='selected_feature'],visibility=[[b['id'],b['state']['availability'],dict(filter=b['scope']['filter'] or 'unfiltered',where=b['scope']['where'] or '1=1',layer_id=b['scope']['layer_id'])] for b in request['evidence'] if b['kind'] in ('map_layer','document')]))
    value=2166136261
    for byte in text.encode(): value=((value^byte)*16777619)&0xffffffff
    return f'scope-{value:08x}'


def conversation(request):
    key=scope_key(request)
    restricted=any(b['kind']=='kb' and b['values']['module_id'] not in request['jurisdiction']['enabled_kb_modules'] or b['kind']=='map_layer' and b['state']['availability'] in ('hidden','omitted') for b in request['evidence'])
    excluded=[m for m in request['history'] if m['role']=='assistant' and (m.get('scope_key')!=key if m.get('scope_key') else restricted)]
    history=[dict(role=m['role'],content=m['content']) for m in request['history'] if m not in excluded]
    return dict(history=history,warnings=['Prior assistant prose from a different KB or source selection was excluded.'] if excluded else [],key=key)


def retrieve(block,question):
    wanted=terms(question);chunks=[]
    for passage in block['values']['passages']:
        text=passage['text']
        for start in range(0,len(text),CFG['document_chunk_chars']):
            content=text[start:start+CFG['document_chunk_chars']]
            end=passage['start']+min(start+CFG['document_chunk_chars'],len(text))
            chunks.append(dict(id=f"{block['id']}:{passage['start']+start}-{end}",start=passage['start']+start,end=end,text=content,score=sum(t in terms(content) for t in wanted)))
    ranked=sorted([dict(p,index=i) for i,p in enumerate(chunks)],key=lambda p:(-p['score'],p['index']))
    selected=set()
    for p in [p for p in ranked if p['score']>0][:2]:
        selected.update(range(max(0,p['index']-CFG['document_neighbor_chunks']),min(len(chunks)-1,p['index']+CFG['document_neighbor_chunks'])+1))
    if not selected and chunks:
        selected.add(0)
        if len(chunks)>1: selected.add(len(chunks)-1)
    passages=[{k:v for k,v in chunks[i].items() if k!='score'} for i in sorted(selected)[:CFG['document_chunks_per_source']]]
    coverage='full' if sum(p['end']-p['start'] for p in passages)==sum(p['end']-p['start'] for p in chunks) and block['state']['completeness']=='complete' else 'selected passages only'
    return dict(passages=passages,coverage=coverage)


def header(block):
    return {k:copy.deepcopy(block[k]) for k in ('id','kind','source','fetched_at','valid_interval','geography','scope','state','limitations')}


def projection(block,request,intent):
    out=header(block)
    if block['kind']=='document': out['values']=retrieve(block,request['question'])
    elif block['kind']=='map_layer': out['values']=dict(complete_count=block['values']['complete_count'],unit=block['values'].get('unit'),samples=block['values'].get('samples',[])[:3],summary=block['values'].get('summary'))
    elif block['kind']=='forecast':
        text=request['question'].lower()
        named=re.search('tonight|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday',text)
        periods=block['values'].get('periods',[])
        exact=[op['scope']['interval'] for op in (intent or {}).get('operations',[]) if op['intent']=='forecast_facts' and op['status']=='ready']
        if exact:
            from datetime import datetime
            instant=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))
            periods=[p for p in periods if any(instant(p['startTime'])>=instant(i['start']) and instant(p['endTime'])<=instant(i['end']) for i in exact)]
        elif named:
            periods=context_forecast_periods(request,periods)
            if not periods:out['limitations'].append('Requested forecast period is outside supplied point-forecast coverage.');out['state']['completeness']='partial'
        fields=('name','isDaytime','startTime','endTime','temperature','temperatureUnit','windSpeed','windDirection','detailedForecast','shortForecast','probabilityOfPrecipitation')
        out['values']=dict(periods=[{k:p[k] for k in fields if k in p} for p in periods])
    elif block['kind']=='live' and isinstance(block['values'].get('raw'),dict) and any((block['values']['raw'].get('properties',{}).get(k) or {}).get('values') for k in ('windGust','windSpeed','quantitativePrecipitation','probabilityOfPrecipitation')):
        from datetime import datetime,timedelta
        properties=block['values']['raw']['properties'];windows=context_forecast_periods(request,[p for b in request['evidence'] if b['kind']=='forecast' for p in b['values'].get('periods',[])])
        fields=['windGust','windSpeed'] if re.search('gust',request['question'],re.I) else ['quantitativePrecipitation'] if re.search('rainfall|rain amount',request['question'],re.I) else ['windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation']
        series={}
        def overlaps(row):
            if not windows:return True
            parts=str(row.get('validTime','')).split('/')
            match=re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?',parts[1] if len(parts)>1 else '')
            if not match:return True
            start=datetime.fromisoformat(parts[0].replace('Z','+00:00'));end=start+timedelta(seconds=float(match[1] or 0)*86400+float(match[2] or 0)*3600+float(match[3] or 0)*60+float(match[4] or 0))
            return any(start<datetime.fromisoformat(p['endTime'].replace('Z','+00:00')) and end>datetime.fromisoformat(p['startTime'].replace('Z','+00:00')) for p in windows)
        for key in fields:
            if key not in properties:continue
            values=[row for row in properties[key].get('values',[]) if overlaps(row)]
            out['state']['completeness']='partial';out['limitations'].append('Grid series: requested-window coverage is unverified; missing or null intervals must not be treated as zero or used to assert a full-window maximum or total.')
            series[key]=dict(uom=properties[key].get('uom'),values=values[:48],coverage='first 48 matching intervals only' if len(values)>48 else 'all matching supplied intervals')
            if len(values)>48:out['state']['completeness']='partial';out['limitations'].append('Grid intervals capped; do not extrapolate full-window maxima or totals.')
        out['values']=dict(series=series)
    else: out['values']=copy.deepcopy(block['values'])
    return out


def build_local_context(request,allocated_context,intent=None,deterministic=''):
    demand=needs(request);convo=conversation(request);warnings=list(convo['warnings']);omitted=[];required=[];optional=[]
    for block in request['evidence']:
        if block['id']=='legacy_context': continue
        if block['values'].get('content_omitted'):omitted.append(dict(id=block['id'],reason=block['values']['content_omitted']));continue
        if block['kind']=='kb':
            if block['values']['module_id'] in request['jurisdiction']['enabled_kb_modules'] and block['state']['availability']=='available': required.append(dict(header(block),values=copy.deepcopy(block['values'])))
            else: omitted.append(dict(id=block['id'],reason='disabled or excluded KB module'))
            continue
        if block['state']['availability'] in ('hidden','omitted'):
            omitted.append(dict(id=block['id'],reason='processing budget omission' if block['state']['omission_reason']=='budget' else 'not visible in current selection'));continue
        if block['kind']=='selected_feature': required.append(projection(block,request,intent));continue
        text=block['source']['name']+' '+block['kind']+' '+canonical(block['values']);words=terms(text)
        requested=block['source']['id'] in request['selection']['source_ids'] or (demand['maps'] or demand['broad']) and block['scope']['layer_id'] in request['selection']['layer_ids']
        relevant=block['kind']=='live' and source_needed(dict(id=block['source']['id'],name=block['source']['name'],tags=[block['values'].get('category','')]),request) or requested or demand['broad'] or block['kind']=='document' or block['kind']=='map_layer' and demand['maps'] or block['kind']=='forecast' and demand['weather'] or any(t in words for t in terms(request['question']))
        if not relevant: omitted.append(dict(id=block['id'],reason='not needed for this question'));continue
        projected=projection(block,request,intent)
        if block['kind']=='document' and block['state']['completeness']!='complete':warnings.extend(block['limitations'])
        if block['kind']=='document' and projected['values']['coverage']!='full': warnings.append(f"{block['source']['name']}: only selected document passages are included.")
        if len(canonical(projected))>CFG['per_source_chars']:
            omitted.append(dict(id=block['id'],reason='source exceeds the per-source processing budget; narrow the requested fields or period'));continue
        optional.append(projected)
    for id in request['jurisdiction']['enabled_kb_modules']:
        if not any(b['kind']=='kb' and b['values']['module_id']==id for b in required): warnings.append(f'Enabled KB module {id} is missing from the snapshot; it was not disabled by the selector.')
    share=min(CFG['per_source_chars'],CFG['optional_context_chars']//max(1,len(optional)))
    for source in optional:
        if source['kind']=='document':
            while len(canonical(source))>share and len(source['values']['passages'])>1:
                ranked=sorted(enumerate(source['values']['passages']),key=lambda item:(sum(t in terms(item[1]['text']) for t in terms(request['question'])),-item[0]))
                source['values']['passages'].pop(ranked[0][0]);source['values']['coverage']='selected passages only'
    included=list(required)
    def make_messages():
        content=(f"Grounded local synthesis · {CFG['prompt_version']}\n{CFG['rules']}\n{COPILOT_RULES}\nJurisdiction: {request['jurisdiction']['name']}\nAll enabled KB modules: {canonical(request['jurisdiction']['enabled_kb_modules'])}\nEVIDENCE:\n"+'\n'.join(canonical(b) for b in included)+f"\nDETERMINISTIC RESULTS:\n{deterministic}\nCOVERAGE:\n"+canonical(dict(included=[b['id'] for b in included],omitted=omitted,warnings=warnings))+f"\n{CFG['response_rules']}")
        return [dict(role='system',content=content)]+convo['history']+[dict(role='user',content=request['question'])]
    optional_chars=0
    for source in optional:
        size=len(canonical(source))
        if optional_chars+size>CFG['optional_context_chars']: omitted.append(dict(id=source['id'],reason='total optional-evidence processing budget'));continue
        included.append(source)
        if not input_estimate(make_messages(),allocated_context)['fits_estimate']:
            included.pop();omitted.append(dict(id=source['id'],reason='local input capacity after mandatory KB/question/history and output reserve'))
        else: optional_chars+=size
    while not input_estimate(make_messages(),allocated_context)['fits_estimate'] and len(included)>len(required):
        source=included.pop();omitted.append(dict(id=source['id'],reason='input capacity including source coverage metadata'))
    messages=make_messages();accounting=input_estimate(messages,allocated_context)
    missing=any(not any(b['kind']=='kb' and b['values']['module_id']==id for b in required) for id in request['jurisdiction']['enabled_kb_modules'])
    limit='An enabled KB module is missing from the retained snapshot; full KB-backed synthesis cannot be verified.' if missing else 'Mandatory enabled KB, question, history or required feature evidence exceeds the safe local input capacity. No mandatory evidence was discarded.' if not accounting['fits_estimate'] else None
    return dict(messages=messages,context=dict(policy='local_bounded',prompt_version=CFG['prompt_version'],scope_key=convo['key'],included_ids=[b['id'] for b in included],omitted=[dict(item,source_name=next((b['source']['name'] for b in request['evidence'] if b['id']==item['id']),item['id'])) for item in omitted],warnings=warnings,accounting=accounting,processing_limit=limit,enabled_kb_modules=list(request['jurisdiction']['enabled_kb_modules'])),selected=included)
