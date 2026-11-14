"""Versioned pure request-time/window contract; parity fixtures also run in JS."""
import json,math,re
from datetime import datetime,timedelta,timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SCOPE_VERSION='request-scope-v1'
POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/request-scope-policy.json').read_text())
WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december']
STAMP=r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})'


def instant(value):
    try:
        if not isinstance(value,str) or not re.fullmatch(STAMP,value,re.I):return math.nan
        return datetime.fromisoformat(value.upper().replace('Z','+00:00')).timestamp()*1000
    except (ValueError,TypeError):return math.nan


def utc(ms):return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z').replace('.000Z','Z')


def local_stamp(value,zone):return datetime.fromtimestamp((instant(value) if isinstance(value,str) else value)/1000,ZoneInfo(zone)).isoformat(timespec='seconds')


def add_days(date,n):return (datetime.fromisoformat(date).date()+timedelta(days=n)).isoformat()


def valid_date(date):return math.isfinite(instant(date+'T00:00:00Z'))


def civil(date,clock,zone):
    if clock=='24:00':return civil(add_days(date,1),'00:00',zone)
    if not valid_date(date) or not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',clock):return math.nan
    naive=datetime.fromisoformat(date+'T'+clock+':00');tz=ZoneInfo(zone)
    choices=set()
    for fold in (0,1):
        value=naive.replace(tzinfo=tz,fold=fold).timestamp()*1000
        if local_stamp(value,zone)[:16]==date+'T'+clock:choices.add(value)
    return choices.pop() if len(choices)==1 else math.nan


def sunrise(date,reference):
    if not valid_date(date) or not isinstance(reference,(list,tuple)) or len(reference)!=2 or any(type(n) not in (int,float) or not math.isfinite(n) for n in reference) or abs(reference[0])>=90 or abs(reference[1])>180:return math.nan
    d=datetime.fromisoformat(date);year=d.year;doy=d.timetuple().tm_yday;days=(datetime(year+1,1,1)-datetime(year,1,1)).days
    g=2*math.pi/days*(doy-1);c=math.cos;s=math.sin
    eq=229.18*(.000075+.001868*c(g)-.032077*s(g)-.014615*c(2*g)-.040849*s(2*g))
    dec=.006918-.399912*c(g)+.070257*s(g)-.006758*c(2*g)+.000907*s(2*g)-.002697*c(3*g)+.00148*s(3*g)
    lat=reference[0]*math.pi/180;x=c(90.833*math.pi/180)/(c(lat)*c(dec))-math.tan(lat)*math.tan(dec)
    if abs(x)>1:return math.nan
    minutes=720-4*(reference[1]+math.acos(x)*180/math.pi)-eq
    return instant(date+'T00:00:00Z')+math.floor(minutes+.5)*60000


def interval(start,end,zone):
    if not math.isfinite(start) or not math.isfinite(end) or end<=start:return None
    return dict(start_utc=utc(start),end_utc=utc(end),start_local=local_stamp(start,zone),end_local=local_stamp(end,zone))


def matching_period(weather,date,night,zone,now,overnight=False):
    unique={}
    for source in weather:
        if source.get('state') in ('unavailable','stale'):continue
        for p in source.get('data',{}).get('properties',{}).get('periods',[]):
            start,end=instant(p.get('startTime')),instant(p.get('endTime'))
            if type(p.get('isDaytime')) is not bool or p['isDaytime'] is night or not math.isfinite(start) or not math.isfinite(end):continue
            if (start<=now<end) if overnight else local_stamp(start,zone)[:10]==date and int(local_stamp(start,zone)[11:13])>=12:
                unique[p['startTime']+'|'+p['endTime']]=dict(p=p,ref=dict(source=source['id'],url=source['url'],start=p['startTime'],end=p['endTime'],geography=source['geography']))
    return next(iter(unique.values())) if len(unique)==1 else None


def extract_iap(files,incident,now):
    plans=[]
    for file in files:
        text=file.get('content','')
        if not re.search(r'\b(?:IAP|incident action plan)\b',text,re.I):continue
        def field(pattern):
            match=re.search(pattern,text,re.I|re.M)
            return match[1].strip() if match else None
        id=field(r'^Incident(?: ID| name)?[ \t]*:[ \t]*(.+)$')
        if incident and (id or '').lower()!=incident.lower():continue
        refs=dict(document=file['name'],incident=id,revision=field(r'^Revision[ \t]*:[ \t]*(.+)$'),approved=field(r'^Approved[ \t]*:[ \t]*(.+)$'))
        current=field(r'^Current operational period[ \t]*:[ \t]*(.+)$');next_period=field(r'^Next operational period[ \t]*:[ \t]*(.+)$')
        refs.update(current_period=current,next_period=next_period)
        if not next_period:continue
        def parse(line):
            m=re.fullmatch('('+STAMP+r')\s+to\s+('+STAMP+')',line or '',re.I)
            return dict(start=instant(m[1]),end=instant(m[2])) if m and instant(m[1])<instant(m[2]) else None
        cur,nxt=parse(current),parse(next_period)
        if not incident or not id or not re.match(r'^(yes|approved)\b',refs['approved'] or '',re.I) or not cur or not nxt or not cur['start']<=now<cur['end'] or nxt['start']<cur['end']:plans.append(dict(error='IAP applicability, approval, timezone or current/next operational-period fields need clarification.',ref=refs))
        else:plans.append(dict(**nxt,ref=refs))
    return plans


def _resolve_scope(question,requested_at,jurisdiction,weather=None,files=None,policy=None,sunrise_fn=sunrise):
    policy=policy or POLICY;weather=weather or [];files=files or [];zone=jurisdiction['timezone'];now=instant(requested_at)
    if not math.isfinite(now):raise ValueError('Invalid authoritative request time')
    scope=dict(version=SCOPE_VERSION,request_utc=utc(now),request_local=local_stamp(now,zone),timezone=zone,jurisdiction=jurisdiction['name'],status='unspecified',method=None,interval=None,source_refs=[],assumptions=[],clarification=None,coverage=[])
    text=question.lower().replace('’',"'")
    def clarify(message):return dict(scope,status='clarify',clarification=message)
    def resolved(start,end,method,refs=None):
        i=interval(start,end,zone)
        return dict(scope,status='resolved',method=method,interval=i,source_refs=refs or []) if i else clarify('The requested clock is invalid or ambiguous across a daylight-saving transition. Supply explicit UTC offsets.')
    explicit=re.search('('+STAMP+r')\s+to\s+('+STAMP+')',question,re.I)
    if explicit:return resolved(instant(explicit[1]),instant(explicit[2]),'explicit')
    local_range=re.search(r'(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)\s+to\s+(\d{4}-\d{2}-\d{2})[ T]([0-2]\d:[0-5]\d)',question,re.I)
    if local_range:return resolved(civil(local_range[1],local_range[2],zone),civil(local_range[3],local_range[4],zone),'explicit')
    if re.search(r'\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\bnext week\b',text):return clarify('Specify an unambiguous calendar date or start/end interval.')
    if re.search(r'\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}.*\bto\b',text):return clarify('Supply valid offset-bearing timestamps or unambiguous local clock endpoints.')
    if len(set(re.findall(r'\b('+'|'.join(WEEKDAYS)+r')\b',text)))>1:return clarify('Supply explicit dates or a start/end interval for multiple weekdays.')
    today=local_stamp(now,zone)[:10];date=today;explicit_date=False
    dates=re.findall(r'\b\d{4}-\d{2}-\d{2}\b',text)
    if any(not valid_date(d) for d in dates):return clarify('Supply a valid calendar date.')
    if len(dates)==2 and re.search(r'\bto\b',text):return resolved(civil(dates[0],'00:00',zone),civil(add_days(dates[1],1),'00:00',zone),'explicit')
    if len(dates)>1:return clarify('Specify a single date or an explicit start-to-end interval.')
    if dates:date=dates[0];explicit_date=True
    month=re.search(r'\b('+'|'.join(MONTHS)+r') (\d{1,2})(?:,? (\d{4}))?\b',text,re.I)
    if month:
        if explicit_date:return clarify('Conflicting date expressions need clarification.')
        date=f"{month[3] or today[:4]}-{MONTHS.index(month[1])+1:02}-{int(month[2]):02}"
        if not valid_date(date):return clarify('Supply a valid calendar date.')
        explicit_date=True
        if not month[3]:scope['assumptions'].append('Named month/day uses the request-local year.')
    weekday=re.search(r'\b('+'|'.join(WEEKDAYS)+r')\b',text)
    if weekday:
        if re.search(r'\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b',text):return clarify('Which calendar date do you mean by next '+weekday[1]+'?')
        target=add_days(today,(WEEKDAYS.index(weekday[1])-(datetime.fromisoformat(today).weekday()+1)%7)%7)
        if explicit_date and (datetime.fromisoformat(date).weekday()+1)%7!=WEEKDAYS.index(weekday[1]):return clarify('The weekday and explicit date disagree.')
        if not explicit_date:date=target
    relative=re.findall(r'\b(?:day after tomorrow|two days from now|next working day|tomorrow|today|tonight|overnight)\b',text)
    if len(set(relative))>1:return clarify('Specify one requested date/window, or an explicit start-to-end interval.')
    if relative and explicit_date:return clarify('The relative and explicit dates need clarification.')
    if relative and relative[0] in ('tomorrow','next working day'):date=add_days(today,1)
    if relative and relative[0] in ('day after tomorrow','two days from now'):date=add_days(today,2)
    if weekday and relative:
        offset=1 if relative[0] in ('tomorrow','next working day') else 2 if relative[0] in ('day after tomorrow','two days from now') else 0
        if (datetime.fromisoformat(add_days(today,offset)).weekday()+1)%7!=WEEKDAYS.index(weekday[1]):return clarify('The weekday and relative date disagree.')
    incident_match=re.search(r'\bfor\s+([a-z]+-\d+)\b',question,re.I) or re.search(r'\b([a-z]+-\d+)\b',question,re.I)
    incident=incident_match[1] if incident_match else None
    clocks=re.search(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b',text)
    requested_part=re.search(r'\b(am|morning|afternoon|evening)\b',text)
    if clocks:
        def clock(h,m,ap):
            if ap and not 1<=int(h)<=12:return 'invalid'
            return f"{(int(h)%12+(12 if ap=='pm' else 0)) if ap else int(h):02}:{m or '00'}"
        if not explicit_date and not weekday and not relative:scope['assumptions'].append('Undated clock range uses the request-local calendar date.')
        return resolved(civil(date,clock(clocks[1],clocks[2],clocks[3]),zone),civil(date,clock(clocks[4],clocks[5],clocks[6]),zone),'explicit')
    if len(set(re.findall(r'\b(am|morning|afternoon|evening)\b',text)))>1 or requested_part and re.search(r'\b(tonight|overnight|night)\b',text):return clarify('Specify one daypart or an explicit start/end interval.')
    if re.search(r'\bnext operational period\b',text) and not requested_part:
        if not explicit_date and not relative and not weekday:
            if any(re.search(r'\bIAP\b|incident action plan',f['content'],re.I) and re.search(r'^Current operational period:',f['content'],re.I|re.M) and not re.search(r'^Next operational period:',f['content'],re.I|re.M) for f in files):scope['assumptions'].append('An uploaded IAP defines only its current period; no next period was extrapolated.')
            plans=extract_iap(files,incident,now)
            scope['source_refs']=[p['ref'] for p in plans]
            if len(plans)>1 or any(p.get('error') for p in plans):return clarify('Conflicting or incomplete IAP schedules: select the incident/current approved plan and supply offset-bearing period fields.')
            if plans:return resolved(plans[0]['start'],plans[0]['end'],'IAP',[plans[0]['ref']])
            schedules=[p for p in policy.get('incident_schedules',[]) if incident and p['incident'].lower()==incident.lower()]
            if len(schedules)>1:return clarify('Conflicting configured incident schedules.')
            if schedules:
                s=schedules[0]
                if not math.isfinite(instant(s.get('valid_until'))) or instant(s['valid_until'])<now or not instant(s['start'])>=now or not s.get('source'):return clarify('The configured incident schedule is stale or incomplete.')
                return resolved(instant(s['start']),instant(s['end']),'configured',[dict(source=s['source'],incident=incident)])
        if not policy['planning_fallback']['enabled']:return clarify('No applicable next operational period or planning fallback is configured.')
        start=sunrise_fn(date,jurisdiction['center'])
        if not explicit_date and not relative and not weekday and start<=now:date=add_days(date,1);start=sunrise_fn(date,jurisdiction['center'])
        if not math.isfinite(start):return clarify('Sunrise is unavailable for the configured Long Island planning reference/date.')
        scope['assumptions'].append('Application planning fallback: sunrise plus 16 elapsed hours including breaks; all calendar days are eligible. Incident operations continue around the clock. This is not an IAP or command-approved schedule.')
        return resolved(start,start+policy['planning_fallback']['duration_seconds']*1000,'assumed',[dict(source='configured jurisdiction center',reference=jurisdiction['center'],date=date,solar_boundary='sunrise',algorithm=policy['planning_fallback']['algorithm'])])
    if re.search(r'\b(?:tonight|overnight|night)\b',text):
        period=matching_period([s for s in weather if s['geography']==jurisdiction['name']],date,True,zone,now,bool(relative and relative[0]=='overnight'))
        if relative and relative[0]=='overnight' and not period:period=matching_period([s for s in weather if s['geography']==jurisdiction['name']],date,True,zone,now)
        if not period:return clarify('The requested night is not uniquely covered by a supplied local point-forecast night period. Supply explicit start/end times or refresh the forecast.')
        return resolved(instant(period['p']['startTime']),instant(period['p']['endTime']),'source_period',[period['ref']])
    part=re.search(r'\b(am|morning|afternoon|evening)\b',text)
    if part:
        start,end=policy['dayparts'][part[1]];scope['assumptions'].append(f'Application {part[1]} boundary: {start}:00–{end}:00 local.')
        return resolved(civil(date,f'{start:02}:00',zone),civil(date,f'{end:02}:00',zone),'configured')
    if re.search(r'\blater today\b',text):
        scope['assumptions'].append('Later today means the remaining local calendar day.')
        return resolved(now,civil(add_days(today,1),'00:00',zone),'configured')
    if explicit_date or relative or weekday:return resolved(civil(date,'00:00',zone),civil(add_days(date,1),'00:00',zone),'explicit')
    return scope


def duration_end(value):
    parts=str(value or '').split('/')
    if len(parts)!=2:return math.nan
    m=re.fullmatch(r'P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?',parts[1])
    if not m:return math.nan
    seconds=float(m[1] or 0)*86400+float(m[2] or 0)*3600+float(m[3] or 0)*60+float(m[4] or 0)
    return instant(parts[0])+seconds*1000 if seconds>0 else math.nan


def covered(intervals,start,end):
    cursor=start
    for a,b in sorted(intervals):
        if a>cursor:return False
        cursor=max(cursor,b)
        if cursor>=end:return True
    return False


def scoped_weather(weather,scope):
    result=[]
    for source in weather:
        out=dict(id=source['id'],url=source['url'],geography=source['geography'],area=source.get('area'),fetched_at=source.get('fetched_at'),state=source.get('state') or 'available',coverage='unknown',periods=[],series={});result.append(out)
        if scope['status']!='resolved' or source['geography']!=scope['jurisdiction'] or out['state'] in ('stale','unavailable'):continue
        start,end=instant(scope['interval']['start_utc']),instant(scope['interval']['end_utc'])
        def overlap(a,b):return math.isfinite(a) and math.isfinite(b) and a<b and a<end and b>start
        p=source.get('data',{}).get('properties',{})
        if isinstance(p.get('periods'),list):
            out['periods']=[r for r in p['periods'] if overlap(instant(r.get('startTime')),instant(r.get('endTime')))]
            out['coverage']='complete' if covered([(instant(r['startTime']),instant(r['endTime'])) for r in out['periods']],start,end) else 'partial'
        for key in ('windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation'):
            series=p.get(key)
            if not isinstance(series,dict) or not isinstance(series.get('values'),list):continue
            rows=[r for r in series['values'] if overlap(instant(str(r.get('validTime')).split('/')[0]),duration_end(r.get('validTime')))]
            out['series'][key]=dict(uom=series.get('uom'),values=rows,coverage='complete' if covered([(instant(r['validTime'].split('/')[0]),duration_end(r['validTime'])) for r in rows if r.get('value') is not None],start,end) else 'partial')
            out['coverage']='field-specific; no full-window aggregate calculated'
    return result


def render_request_scope(scope,weather=None):
    return 'REQUEST SCOPE (application resolved; source snapshots are client-supplied evidence):\n'+json.dumps(scope,ensure_ascii=False,separators=(',',':'))+'\nWINDOW MATCHES (only these weather intervals may establish facts for this window; partial/missing/null coverage is unknown):\n'+json.dumps(scoped_weather(weather or [],scope),ensure_ascii=False,separators=(',',':'))+'\n'


def weather_snapshots(results,jurisdiction):
    keys=('periods','windSpeed','windGust','quantitativePrecipitation','probabilityOfPrecipitation')
    return [dict(id=r['ep']['id'],url=r['ep']['url'],geography=jurisdiction['name'],area=r['ep']['name'],fetched_at=r.get('fetchedAt') or r.get('fetched_at'),state='available' if r.get('ok',r.get('success')) else 'unavailable',data=dict(properties={k:r['data']['properties'][k] for k in keys if isinstance(r['data']['properties'].get(k) if k=='periods' else (r['data']['properties'].get(k) or {}).get('values'),list)})) for r in results if r.get('ep') and isinstance(r.get('data'),dict) and any(isinstance(r['data'].get('properties',{}).get(k) if k=='periods' else (r['data'].get('properties',{}).get(k) or {}).get('values'),list) for k in keys)]


def resolve_request_scope(question,requested_at,jurisdiction,weather=None,files=None,policy=None,sunrise_fn=sunrise):
    scope=_resolve_scope(question,requested_at,jurisdiction,weather,files,policy,sunrise_fn)
    if scope['interval']:scope['historical']=instant(scope['interval']['end_utc'])<=instant(scope['request_utc'])
    scope['coverage']=[dict(id=s['id'],state=s['state'],coverage=s['coverage'],fields={k:v['coverage'] for k,v in s['series'].items()}) for s in scoped_weather(weather or [],scope)]
    return scope


def needs_scope_refresh(result,question,requested_at,jurisdiction,policy=None):
    weather=weather_snapshots([result],jurisdiction)
    if not weather:return False
    scope=resolve_request_scope(question,requested_at,jurisdiction,weather,policy=policy)
    if scope.get('historical'):return False
    if scope['status']=='clarify':return bool(re.search('night|tonight|overnight',question,re.I))
    return scope['status']=='resolved' and any(s['coverage']=='partial' or 'partial' in s['fields'].values() for s in scope['coverage'])
