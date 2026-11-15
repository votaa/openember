"""Request-local evidence references with explicit unresolved applicability."""
import re,json
from pathlib import Path
KB_CATALOG=json.loads((Path(__file__).resolve().parents[1]/'shared/kb-context-records.json').read_text())
from request_scope import scoped_weather
from coops_evidence import select_coops
def build_location_evidence_bundle(scope,weather=None,coops=None,files=None,context=''):
    sources=[];claims=[];gaps=[]
    def add(kind,source,location,time,payload,raw):
        id='s'+str(len(sources));sources.append(dict(id=id,kind=kind,source=source,location=location,time=time,raw=raw))
        if payload is not None:claims.append(dict(id='c'+str(len(claims)),source_id=id,location=location,time=time,payload=payload))
    for index,s in enumerate(scoped_weather(weather or [],scope)):
        location=s.get('location_relationship') or dict(status='unknown',basis=s['coverage']);obs=s.get('latest_reported') or s.get('observation');has_obs=bool(s.get('observation',{}).get('fields'))
        time=dict(request_utc=scope['request_utc'],fetched_at=s['fetched_at'],observed_at=(obs or {}).get('timestamp'),selected_interval=s.get('selected_interval'),disposition='latest_reported' if s.get('latest_reported') else 'current_observation' if has_obs else s.get('granularity',s['state']))
        payload=obs if s.get('latest_reported') or has_obs else dict(periods=s['periods'],series=s['series']) if s['periods'] or s['series'] else None
        add('weather',dict(id=s['id'],url=s['url'],provenance='client_snapshot'),location,time,payload,dict(collection='weather',index=index))
        if payload is None or s['coverage']!='complete':gaps.append(dict(source_id=sources[-1]['id'],reason=s['coverage'],state=s['state']))
    for index,s in enumerate(select_coops(coops or [],scope,'')):
        add('coops',dict(id=s['id'],url=s['url'],provenance='client_snapshot'),dict(status='reference_only',basis='Gauge/site linkage requires separately validated source evidence.'),dict(request_utc=scope['request_utc'],disposition=s['state']),s if s['events'] or s['background'] else None,dict(collection='coops',index=index))
    for index,f in enumerate(files or []):add('upload',dict(name=f['name'],provenance='uploaded_source_assertion'),dict(status='unresolved',basis='Document site applicability requires claim review.'),dict(request_utc=scope['request_utc'],disposition='source_validity_unresolved'),None,dict(collection='uploads',index=index))
    starts=[m.start() for m in re.finditer(r'^--- .*$',context,re.M)]
    if not starts or starts[0]!=0:starts.insert(0,0)
    for i,start in enumerate(starts):
        end=starts[i+1] if i+1<len(starts) else len(context);text=context[start:end]
        if not text.strip():continue
        # JS strings index UTF-16 code units; raw inspection uses the same spans.
        units=lambda s:len(s.encode('utf-16-le'))//2
        add('enabled_context',dict(id=next((m['module'] for m in KB_CATALOG['modules'] if text.startswith('--- '+m['header']+' ---\n')),None),name=text.split('\n')[0],provenance='source_assertion'),dict(status='unresolved',basis='Regional KB, alerts and loaded layers require source-specific geometry/coverage review.'),dict(request_utc=scope['request_utc'],disposition='source_validity_unresolved'),None,dict(collection='context',start=units(context[:start]),end=units(context[:end]),offset_unit='utf16'))
    gaps.append(dict(source_id=None,reason='Unresolved source applicability or missing evidence does not establish no hazard, no outage or normal operations.'))
    return dict(version='location-evidence-bundle-v1',selected_location=scope.get('selected_location'),sources=sources,claims=claims,gaps=gaps,raw_sources=dict(weather=weather or [],coops=coops or []))

def link_answer_claims(bundle,evidence):
    for record in (r for r in evidence['records'] if r['section'] in ('Facts','Regional KB context')):
        matches=[s for s in bundle['sources'] if s['kind']!='answer_derivation' and (s['source'].get('id')==record['source'] or s['source'].get('name')==record['source'])]
        source=matches[0] if len(matches)==1 else None
        if source is None:
            source=dict(id='s'+str(len(bundle['sources'])),kind='answer_derivation',source=dict(id=record['source'],provenance='bounded_application_record'),location=dict(status='unresolved',basis='Answer record provenance does not establish site applicability.'),time=dict(disposition='source_validity_unresolved'),raw=dict(collection='answer_records',id=record['id']))
            bundle['sources'].append(source)
        claim=dict(id='c'+str(len(bundle['claims'])),source_id=source['id'],location=source['location'],time=source['time'],payload=dict(record_id=record['id'],kind=record['kind'],text=record['text']))
        bundle['claims'].append(claim);record['claim_id']=claim['id'];record['source_id']=source['id']
    return evidence
