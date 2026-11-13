"""UI-owned snapshots. Refresh source data in the owning UI, not from arbitrary URLs."""
from datetime import datetime, timezone
from uuid import uuid4
from copilot_evidence import adapt_evidence


def make_request(question, history, name, enabled, forecast=None, layers=None, reports=None, report_source=None, now=None, timezone_name='America/New_York'):
    now = now or datetime.now(timezone.utc).isoformat()
    def freshness(raw, ttl):
        try:
            age=(datetime.fromisoformat(now.replace('Z','+00:00'))-datetime.fromisoformat((raw.get('fetched_at') or raw.get('fetchedAt') or '').replace('Z','+00:00'))).total_seconds()
            return 'current' if -60 <= age <= ttl else 'stale'
        except (ValueError,TypeError): return 'stale'
    def source(id,name,url): return dict(id=id,name=name,url=url or None,provenance='server_snapshot')
    evidence=[]
    if forecast:
        ep=forecast.get('ep',{})
        evidence.append(adapt_evidence('forecast',forecast,dict(id='point_forecast',source=source('point_forecast',ep.get('name') or forecast.get('name') or 'NWS point forecast',ep.get('url') or forecast.get('url')),geography=name,freshness=freshness(forecast,3600))))
    for layer in layers or []:
        id='layer:'+layer['id']
        evidence.append(adapt_evidence('map_layer',layer,dict(id=id,source=source(id,layer['name'],layer.get('url')),geography=name,layer_id=layer['id'],freshness=freshness(layer,300) if layer.get('state') else 'unknown')))
    if reports and report_source:
        evidence.append(adapt_evidence('reports_311',reports,dict(id=report_source['id'],source=source(report_source['id'],report_source['name'],report_source['endpoint']),geography=name,filter=report_source['required_filter'],description='Configured NYC 311 reporting scope; not all Long Island',freshness=freshness(reports,300))))
    return dict(contract_version='1.0',request_id=str(uuid4()),question=question,answer_method='auto',history=[dict(role=m['role'],content=m['content']) for m in history[-9:]],jurisdiction=dict(id=name,name=name,timezone=timezone_name,enabled_kb_modules=list(enabled)),selection=dict(geography=None,layer_ids=[l['id'] for l in layers or [] if l.get('visible',True)],feature_ids=[],source_ids=[]),evidence=evidence,requested_at=now)


def with_legacy_context(request, context):
    block=adapt_evidence('live',dict(content=context),dict(id='legacy_context',source=dict(id='legacy_context',name='Full legacy context',url=None,provenance='server_snapshot'),geography=request['jurisdiction']['name']))
    return dict(request,evidence=request['evidence']+[block])


def with_synthesis_snapshot(request,kb=None,files=None,sources=None,api_results=None,gauge_data=None,catalog=None,feature=None,history=None):
    from copilot_contract import POLICY
    evidence=list(request['evidence']);limits=POLICY['context']
    from copilot_context import source_needed
    def omission(data,needed):
        if not needed:return 'Not needed for this local question; original source data is retained outside the compact request.'
        import json
        if len(json.dumps(data,separators=(',',':'),ensure_ascii=False).encode())>limits['source_transfer_bytes']:return 'Source exceeds the 256 KiB compact-transfer limit; original source data is retained outside the compact request.'
        return None
    def base(id,name,url=None):return dict(id=id,source=dict(id=id,name=name,url=url,provenance='server_snapshot'),geography=request['jurisdiction']['name'])
    for id,module in (kb or {}).items():
        enabled=id in request['jurisdiction']['enabled_kb_modules']
        block=adapt_evidence('kb',dict(module_id=id,content=module.get('data','')),dict(base('kb:'+id,module.get('label',id),module.get('url')),availability='available' if enabled else 'omitted',omission_reason=None if enabled else 'selection'))
        block['values']['attribution']=module.get('source')
        evidence.append(block)
    remaining=limits['upload_total_bytes']
    for index,file in enumerate(files or []):
        id=f"document:{index}:{file['name']}";full=file.get('content','');size=len(full.encode())
        complete=size<=limits['upload_file_bytes'] and size<=remaining
        content=full if complete else full[:4000];remaining-=len(content.encode())
        block=adapt_evidence('document',dict(file,content=content,extraction_partial=not complete),base(id,file['name']))
        block['values']['original_codepoints']=len(full)
        if not complete:block['limitations'].append('Full-upload retrieval limit exceeded (1 MiB per file, 2 MiB total). Existing opening excerpt retained; split or narrow the upload.')
        evidence.append(block)
    for item in sources or []:
        result=item.get('result',item);ep=result.get('ep',item.get('ep',{}))
        if ep.get('id') in ('nws_forecast','nws_forecast_li') and any(b['kind']=='forecast' for b in request['evidence']):continue
        id='noaa:'+str(ep.get('id',len(evidence)));stamp=result.get('fetched_at',result.get('fetchedAt'))
        try:
            age=(datetime.fromisoformat(request['requested_at'].replace('Z','+00:00'))-datetime.fromisoformat(stamp.replace('Z','+00:00'))).total_seconds()
            freshness='current' if -60<=age<=item.get('ttl_seconds',3600) else 'stale'
        except (ValueError,TypeError,AttributeError):freshness='unknown'
        content_omitted=omission(result.get('data'),source_needed(ep,request))
        block=adapt_evidence('live',dict(fetched_at=stamp,ok=result.get('ok'),success=result.get('success'),error=result.get('error'),raw=None if content_omitted else result.get('data'),content='' if content_omitted else item.get('content',''),category=item.get('category',ep.get('id','live'))),dict(base(id,ep.get('name',item.get('name',id)),result.get('url',ep.get('url',item.get('url')))),freshness=freshness))
        block['values']=dict(raw=None if content_omitted else result.get('data'),content='' if content_omitted else item.get('content',''),category=item.get('category',ep.get('id','live')),content_omitted=content_omitted)
        block['state']['completeness']='complete' if result.get('ok') or result.get('success') else 'unknown'
        if item.get('pending'):
            block['state']['availability']='omitted';block['state']['omission_reason']='budget';block['limitations'].append('Not acquired for this local question; source availability is unverified.')
        evidence.append(block)
    for index,result in enumerate(api_results or []):
        reason=omission(result,source_needed(dict(name=result.get('name',''),tags=[result.get('type','')]),request))
        evidence.append(adapt_evidence('live',dict(fetchedAt=result.get('fetchedAt'),success=result.get('success'),content_omitted=reason) if reason else result,base(f'api:{index}',result.get('name',f'api:{index}'),result.get('url'))))
    for id,value in (gauge_data or {}).items():evidence.append(adapt_evidence('live',value,base('gauge:'+id,'CO-OPS '+id,value.get('url'))))
    for index,value in enumerate(catalog or []):
        reason=omission(value,source_needed(dict(name=value.get('name','Saved catalog metadata'),tags=['catalog']),request))
        block=adapt_evidence('catalog',dict(content='') if reason else value,base(f'catalog:{index}',value.get('name','Saved catalog metadata'),value.get('url')))
        if reason:block['values']['content_omitted']=reason
        evidence.append(block)
    selection=dict(request['selection'],feature_ids=[])
    if feature:
        evidence.append(adapt_evidence('selected_feature',feature,base('selected_feature',feature.get('sourceName',feature.get('source_name','Selected map feature')),feature.get('source_url'))))
        selection['feature_ids'].append('selected_feature')
    scoped_history=[dict(role=m['role'],content=m['content'],**(dict(scope_key=m.get('response',{}).get('context',{}).get('scope_key')) if m['role']=='assistant' else {})) for m in history[-9:]] if history else request['history']
    return dict(request,context_version='1.0',history=scoped_history,evidence=evidence,selection=selection)
