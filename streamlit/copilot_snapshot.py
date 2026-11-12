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
