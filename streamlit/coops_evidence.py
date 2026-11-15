"""CO-OPS instants, product semantics and station scope; raw snapshots remain separate."""
import copy,json,math,re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from request_scope import instant,civil,local_stamp
CONFIG=json.loads((Path(__file__).resolve().parents[1]/'config/jurisdiction.generated.json').read_text())
def coops_snapshots(results=None):
    sources={}
    for r in results or []:
        ep=r.get('ep',r);u=urlparse(ep.get('url',''));q={k:v[0] for k,v in parse_qs(u.query).items()}
        if u.hostname!='api.tidesandcurrents.noaa.gov' or u.path!='/api/prod/datagetter':continue
        station=next((s for s in CONFIG['coops_stations'] if s['id']==q.get('station')),None)
        if not station or q.get('product') not in ('water_level','predictions','wind'):continue
        s=dict(id=ep.get('id',ep['url']),url=ep['url'],station_id=station['id'],station_name=station['name'],coordinates=[station['lng'],station['lat']],role=station.get('role','primary'),timezone=CONFIG.get('jurisdiction',{}).get('timezone','America/New_York'),product=q['product'],units=q.get('units'),datum=q.get('datum'),source_timezone=q.get('time_zone'),fetched_at=r.get('fetchedAt',r.get('fetched_at')),state='available' if r.get('ok',r.get('success')) else 'unavailable',data=copy.deepcopy(r.get('data') or {}))
        sources[s['id']]=s
    return list(sources.values())
POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/coops-policy.json').read_text())
def select_coops(sources,scope,question=''):
    named=[sid for sid,names in POLICY['station_names'].items() if sid in question or any(name.lower() in question.lower() for name in names)]
    from datetime import datetime,timezone
    def utc(ms):return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    now=instant(scope['request_utc']);start=instant((scope.get('interval') or {}).get('start_utc'));end=instant((scope.get('interval') or {}).get('end_utc'));result=[]
    for source in sources or []:
        normalized=coops_snapshots([dict(ep=dict(id=source.get('id'),url=source.get('url','')),success=source.get('state')!='unavailable',data=source.get('data'),fetched_at=source.get('fetched_at'))])
        if not normalized:
            result.append(dict(id=source.get('id'),state='unavailable',events=[],background=[],facility_applicability='unknown',limitation='Unconfigured station or product.'));continue
        out=normalized[0];data=out.pop('data');out.update(events=[],background=[],facility_applicability='unknown',limitation='Station evidence only; facility linkage unknown. Tide predictions are astronomical tides, not surge or total-water-level forecasts. Event samples do not establish continuous coverage or flood likelihood.')
        out['facility_applicability']='; '.join(f"Source {r['source']} documents linkage to {r['target']}: {r['statement']}" for r in scope.get('facility_linkages',[]) if r['station_id']==out['station_id']) or 'unknown'
        result.append(out)
        if named and out['station_id'] not in named:out['state']='outside_requested_geography';continue
        age=now-instant(out['fetched_at'])
        if not math.isfinite(age) or age< -300000 or age>3600000 or source.get('state')=='stale':out['state']='stale'
        if out['state']!='available' or out['units'] not in ('english','metric') or out['product']!='wind' and not out['datum']:continue
        if data.get('metadata',{}).get('id') and data['metadata']['id']!=out['station_id']:out['state']='unavailable';continue
        rows=data.get('predictions' if out['product']=='predictions' else 'data',[])
        for row in rows if isinstance(rows,list) else []:
            if not isinstance(row,dict):continue
            at=instant(row.get('t'))
            if not math.isfinite(at) and re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}',str(row.get('t',''))):
                if out['source_timezone']=='gmt':at=instant(row['t'].replace(' ','T')+':00Z')
                elif out['source_timezone']=='lst_ldt':at=civil(row['t'][:10],row['t'][11:],out['timezone'])
            fields=dict(speed=row.get('s'),direction=row.get('d'),gust=row.get('g')) if out['product']=='wind' else dict(height=row.get('v'))
            try:
                if any(v is None or v=='' for v in fields.values()):continue
                fields={k:float(v) for k,v in fields.items()}
                if not math.isfinite(at) or not all(math.isfinite(v) for v in fields.values()):continue
            except (TypeError,ValueError):continue
            if out['product']!='predictions' and (out['product']=='water_level' and row.get('q') not in ('p','v') or any(float(v or 0)>0 for v in str(row.get('f','')).split(','))):continue
            event=dict(time_utc=utc(at),time_local=local_stamp(at,out['timezone']),values=fields,quality=row.get('q'),type=row.get('type') if out['product']=='predictions' else None)
            if out['product']=='predictions':
                if row.get('type') in ('H','L') and scope['status']=='resolved' and at>=max(start,now) and at<end:out['events'].append(event)
            elif at<=now and now-at<=POLICY['observation_max_age_seconds']*1000:
                out['background'].append(event)
                if scope['status']=='resolved' and (scope.get('method')=='current_observation' or at>=start and at<min(end,now+1)):out['events'].append(event)
        out['background']=sorted(out['background'],key=lambda e:e['time_utc'])[-1:]
    return result
