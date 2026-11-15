"""Typed query records and navigation only; no raw source-paragraph answer channel."""
import json,math,re
from evidence_summary import document_evidence
from request_scope import scoped_weather
from coops_evidence import select_coops
ANSWER_VERSION='operational-answer-v2'
OUTPUT_SCHEMA=dict(type='object',additionalProperties=False,required=['version','records'],properties=dict(version=dict(const=ANSWER_VERSION),records=dict(type='array',maxItems=24,uniqueItems=True,items=dict(type='string'))))
def escape(value):
    text=str(value if value is not None else 'unknown').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    return re.sub(r'([\\`*_[\]#!|])',r'\\\1',text).replace('\r',' ').replace('\n',' ')
def number(n):
    value=math.floor(n*100+0.5)/100
    return str(int(value)) if value.is_integer() else str(value)
UNITS={'wmoUnit:degC':'°C','wmoUnit:degF':'°F','wmoUnit:km_h-1':'km/h','wmoUnit:m_s-1':'m/s','wmoUnit:percent':'%','wmoUnit:Pa':'Pa','wmoUnit:m':'m','wmoUnit:mm':'mm','wmoUnit:degree_(angle)':'degrees'}
LABELS=dict(temperature='temperature',windSpeed='wind',windGust='gusts',relativeHumidity='humidity',barometricPressure='pressure',visibility='visibility',precipitationLastHour='last-hour precipitation',probabilityOfPrecipitation='precipitation probability',quantitativePrecipitation='precipitation interval amounts',snowfallAmount='snowfall interval amounts',iceAccumulation='ice interval amounts')
def query_topics(question=''):
    q=question.lower()
    patterns=dict(weather=r'weather|forecast|conditions|observations?|measured|temperature|\blow\b|wind|gust|rain|snow|precipitation|humidity|visibility',water=r'tide|water|flood|surge|coastal|gauge',assets=r'cones?|inventory|deploy|equipment',command=r'commander|command|assignment',radio=r'radio|channel|communications',procedures=r'procedure|\bsop\b|protocol|mandatory|authorized|evacuat',thresholds=r'threshold|trigger|action limit',impacts=r'impacts?|assess|risks?|threat|effects?|likelihood',facility=r'facility|site',documents=r'\bplan\b|document|upload',contacts=r'contacts?|phone|telephone',evacuation=r'evacuat',heat=r'heat|hot|cooling',humidity=r'humidity',visibility=r'visibility')
    return {k:bool(re.search(v,q)) for k,v in patterns.items()}
FIELD_TOPIC=dict(commander='command',assignment_status='command',inventory='assets',deployment='assets',cone_specifications='assets',cone_ballast='assets',cone_placement='assets',radio_channel='radio',facility_id='facility',facility_coordinates='facility',radio_authority='radio',command_succession='command')
def document_value(row):
    v=row.get('value') or '';field=row['field']
    if field in ('commander','cone_specifications','cone_placement') and re.fullmatch(r"[^\W_](?:[^\W_]|[ .'-]){0,79}",v,re.U):return v
    if field in ('facility_id','radio_channel') and re.fullmatch(r'[A-Z0-9_-]{1,64}',v):return v
    if field=='cone_ballast' and re.fullmatch(r'\d+(?:\.\d+)? (?:lb|kg)(?: (?:each|on each deployed cone))?',v):return v
    if field=='inventory' and re.fullmatch(r'\d+ [^\W\d_][\w-]* cones\.?',v,re.U):return v
    if field=='deployment' and re.fullmatch(r"\d+ [^\W\d_][\w-]* cones deployed at [\w '-]{1,60}(?: for this exercise)?(?:; remaining \d+ in storage)?",v,re.U):return v
    if field=='assignment_status' and re.fullmatch('assigned|unassigned|vacant|pending',v,re.I):return v
    if field=='facility_coordinates':
        m=re.fullmatch(r'(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)',v)
        if m and abs(float(m[1]))<=90 and abs(float(m[2]))<=180:return v
    return None

def build_answer_records(scope,files=None,weather=None,coops=None,context='',question='',operational=None):
    files=files or [];operational=operational or dict(records=[],issues=[]);records=[];t=query_topics(question)
    def add(section,text,source='application',kind='fact',required=True):
        if not any(r['section']==section and r['text']==text for r in records):records.append(dict(id='a'+str(len(records)),section=section,text=text,source=source,kind=kind,required=required))
    def relevant(field):
        if field=='assignment_status':return bool(re.search('assignment status|vacant|unassigned|assigned',question,re.I))
        if field=='facility_id':return bool(re.search(r'facility (?:id|identifier)',question,re.I))
        if field=='facility_coordinates':return t['facility'] and t['impacts'] or bool(re.search('coordinates|facility location|site location',question,re.I))
        if field in ('cone_specifications','cone_ballast','cone_placement'):return t['assets'] and t['impacts'] or bool(re.search(field.split('_')[1],question,re.I))
        return t.get(FIELD_TOPIC.get(field),False)
    docs=document_evidence(files)
    for file in files:
        missing=[];review=[]
        for row in [r for r in docs if r['source']==file['name'] and relevant(r['field'])]:
            if row['field'] in ('radio_authority','command_succession'):
                if row['status']=='supplied' and not any(r['source']==row['source'] and r['kind']=='procedure' for r in operational['records']):review.append(row['field'].replace('_',' '))
                continue
            value=document_value(row);name=row['field'].replace('_',' ')
            if row['status']=='supplied' and value is not None:add('Facts',f"{escape(file['name'])} — {name}: {escape(value)}.",file['name'],row['field'])
            elif row['status']=='conflicting':add('Gaps',f"{escape(file['name'])} contains conflicting {name} statements; no single value is established.",file['name'],'conflict')
            elif row['status']=='not provided':add('Gaps',f"{escape(file['name'])} does not supply {name}; this does not establish absence.",file['name'],'gap')
            elif row['status']=='supplied':review.append(name)
            else:missing.append(name)
        if t['assets']:
            for m in re.finditer(r'\b([A-Z][A-Z0-9-]*):\s*(\d+)\s+([A-Za-z-]+)\s+cones\b',file['content']):add('Facts',f"{escape(file['name'])} — inventory entry {escape(m[1])}: {m[2]} {escape(m[3])} cones; deployment is not established by this count.",file['name'],'inventory')
        if t['radio']:
            for m in re.finditer(r'\bradio channel\s+([A-Z0-9-]+)',file['content']):add('Facts',f"{escape(file['name'])} lists radio channel {escape(m[1])}; listing alone does not authorize use.",file['name'],'radio_channel')
        if t['command'] and re.search(r'\bno (?:incident )?commander (?:is )?(?:specified|supplied|named)',file['content'],re.I):add('Gaps',f"{escape(file['name'])} does not name a commander in the supplied passage; actual assignment is not established by that omission.",file['name'],'gap')
        recovered={r['kind'] for r in records if r['source']==file['name'] and r['section']=='Facts'}
        if any(r['source']==file['name'] and 'does not name a commander' in r['text'] for r in records):recovered.add('commander')
        absent=[name for name in missing if name.replace(' ','_') not in recovered]
        if absent:add('Gaps',f"{escape(file['name'])}: {escape(', '.join(dict.fromkeys(absent)))} not extracted as labelled fields. Consult the full source; non-extraction is not absence.",file['name'],'gap')
        if review:add('Gaps',f"{escape(file['name'])}: {escape(', '.join(dict.fromkeys(review)))} needs source review before use as an applicable fact or procedure.",file['name'],'gap')
    if t['weather']:
        for s in scoped_weather(weather or [],scope):
            if s['periods']:
                vals=[p for p in s['periods'] if type(p.get('temperature')) in (int,float) and math.isfinite(p['temperature'])];us={p.get('temperatureUnit') for p in vals}
                if vals and len(us)==1:
                    label='Minimum in the supplied hourly forecast' if s['granularity']=='hourly' else 'Minimum among supplied overlapping point-period values'
                    suffix='Not a published nighttime low.' if s['granularity']=='hourly' else 'Not an extremum resolved to a sub-period.'
                    missing=', some temperature values missing' if len(vals)!=len(s['periods']) else ''
                    add('Facts',f"{label}: {number(min(p['temperature'] for p in vals))} °{escape(vals[0]['temperatureUnit'])}; coverage {s['coverage']}{missing}. {suffix}",s['id'],'forecast')
                winds=list(dict.fromkeys(f"{p.get('windSpeed') or 'unknown'} {p.get('windDirection') or ''}" for p in s['periods']))
                pops=list(dict.fromkeys((p.get('probabilityOfPrecipitation') or {}).get('value') if (p.get('probabilityOfPrecipitation') or {}).get('value') is not None else 'unknown' for p in s['periods']))
                add('Facts',f"Supplied {s['granularity']} wind: {escape('; '.join(winds))}; precipitation probabilities: {escape(', '.join(str(v) for v in pops))}%. Coverage {s['coverage']}.",s['id'],'forecast')
                add('Sources',f"Forecast URL: {escape(s['url'])}.",s['id'],'source')
            fields=['windGust']+(['relativeHumidity'] if t['humidity'] else [])+(['visibility'] if t['visibility'] else [])+(['quantitativePrecipitation'] if re.search('rain|precipitation',question,re.I) else [])+(['snowfallAmount'] if re.search('snow',question,re.I) else [])
            for field in fields:
                if field not in s['series']:continue
                data=s['series'][field];ns=[v['value'] for v in data['values'] if type(v.get('value')) in (int,float) and math.isfinite(v['value'])]
                value=number(min(ns))+'–'+number(max(ns))+' '+escape(UNITS.get(data.get('uom'),'unknown units')) if ns else 'unknown'
                note='Interval amounts are not an accumulated window total.' if field in ('quantitativePrecipitation','snowfallAmount') else ''
                add('Facts',f"{LABELS.get(field,field)} in supplied grid intervals: {value}; coverage {data['coverage']}. {note} Source: {escape(s['url'])}.",s['id'],'forecast')
            obs=s.get('observation')
            if obs and obs['fields']:
                wanted=['relativeHumidity'] if t['humidity'] and not re.search('weather|conditions',question,re.I) else ['visibility'] if t['visibility'] and not re.search('weather|conditions',question,re.I) else ['temperature','windSpeed','windGust']
                values=[]
                for k in wanted:
                    if k not in obs['fields']:continue
                    d=obs['fields'][k];value=number(d['value']) if type(d.get('value')) in (int,float) and math.isfinite(d['value']) else 'unknown';quality=' (quality '+escape(d['qualityControl'])+')' if d.get('qualityControl') and d['qualityControl']!='V' else ''
                    values.append(f"{LABELS[k]} {value} {escape(UNITS.get(d.get('unitCode'),'unknown units'))}{quality}")
                m=re.search(r'/stations/([^/]+)',s['url']);station=m[1] if m else obs['station']
                add('Facts',f"{escape(station)} ({escape(s.get('station_role') or 'station reference')}) at {escape(obs['timestamp'])}: {'; '.join(values)}. Source: {escape(s['url'])}.",s['id'],'observation')
    if t['weather'] and scope.get('method')=='current_observation':add('Gaps','Readings are measured at the named station, not automatically at a facility.' if scope.get('observation_selection',{}).get('mode')=='named_station' else f"Regional overview: {len({s.get('station_id') for s in scoped_weather(weather or [],scope) if s.get('observation') and s['observation']['fields']})} of {len(scope.get('observation_selection',{}).get('stations',[]))} configured station records selected. Readings do not establish conditions at an unspecified facility.",'application','gap')
    if t['weather'] and not any(r['kind'] in ('forecast','observation') for r in records):add('Gaps','No eligible weather values were selected for this request; refresh the sources or clarify the time/place.','application','gap')
    if t['water']:
        for s in select_coops(coops or [],scope,question):
            if s['state']=='outside_requested_geography':continue
            events=s['events'] if s['product']=='predictions' else s['events'][-1:];background=[] if events else s['background']
            for e in events+background:
                label='astronomical '+('high' if e['type']=='H' else 'low')+' tide prediction' if s['product']=='predictions' else 'current background only, not a future forecast' if background else 'measured '+escape(s['product'])
                value=e['values'].get('height',e['values'].get('speed'));unit=('knots' if s['units']=='english' else 'm/s') if s['product']=='wind' else 'ft' if s['units']=='english' else 'm';datum=' '+escape(s['datum']) if s.get('datum') else ''
                add('Facts',f"{escape(s['station_name'])} ({s['station_id']}, {escape(s['role'])}): {label} {number(value)} {unit}{datum} at {escape(e['time_local'])} / {escape(e['time_utc'])}. Facility linkage: {'source documents a gauge/site linkage; see request metadata' if any(r['station_id']==s['station_id'] for r in scope.get('facility_linkages',[])) else 'unknown'}. Source: {escape(s['url'])}.",s['id'],'coops')
            if not events:add('Gaps',f"{escape(s['station_name'])}: no eligible {escape(s['product'])} events for the requested window ({escape(s['state'])}).",s['id'],'gap')
    for r in operational['records']:
        channels=[document_value(d) for d in docs if d['source']==r['source'] and d['field']=='radio_channel' and d['status']=='supplied']
        radio_match=t['radio'] and any(c and c in (r.get('action') or '') for c in channels)
        command_match=t['command'] and bool(re.search(r'\bcommand(?:er)?\b',r.get('action') or '',re.I))
        generic_procedure=t['procedures'] and not t['radio'] and not t['command']
        if r['kind']=='gauge_linkage' and t['water']:add('Facts',f"{escape(r['source'])} documents linkage of {escape(r['target'])} to gauge {escape(r['station_id'])}; issuer {escape(r['authority'])}; valid {escape(r['valid_start'])}–{escape(r['valid_end'])}.",r['source'],r['kind'])
        if r['kind']=='threshold' and t['thresholds'] or r['kind']=='procedure' and (radio_match or command_match or generic_procedure):add('Facts',f"{escape(r['source'])} states: “{escape(r['statement'])}” Issuer: {escape(r['authority'])}; valid {escape(r['valid_start'])}–{escape(r['valid_end'])}; {escape(r['source_url'])}.",r['source'],r['kind'])
    if t['procedures'] or t['thresholds'] or t['radio'] or t['command']:
        for issue in operational['issues']:add('Gaps',escape(issue))
    if (t['procedures'] or t['thresholds']) and not any(r['kind'] in ('threshold','procedure') for r in operational['records']):add('Gaps','No applicable operational threshold or mandatory procedure was validated. Full source material remains available for review.')
    if t['impacts']:
        if t['assets'] and any(r['kind'] in ('inventory','deployment') for r in records):add('Possible impacts','Cone displacement is possible if cones are deployed. A stability assessment needs a supported wind rating and applicable installation conditions; the forecast is not an equipment action limit.')
        if t['facility'] or t['water']:add('Gaps','Facility location, exposure and vulnerability must be established before assigning a site-specific impact likelihood.')
    if files and any(t[k] for k in ('facility','documents','assets','command','radio','procedures','thresholds')):
        for file in files:add('Sources',f"Uploaded source: {escape(file['name'])}. Full text is available under Request sources.",file['name'],'navigation',False)
    if not any(t.values()):add('Gaps','This request needs source interpretation beyond the validated record types. Inspect the full request sources; no operational requirement has been inferred.')
    if not records:add('Gaps','No matching validated answer records were extracted. Inspect the full request sources for information not represented by these record types.')
    return dict(version=ANSWER_VERSION,route='bounded_query_records',topics=t,records=records,facts=[r for r in records if r['section']=='Facts'],gaps=[r['text'] for r in records if r['section']=='Gaps'],references=[r for r in records if r['kind']=='navigation'])
def answer_instruction(evidence):return '\nCONTROLLED OUTPUT CONTRACT: Answer only the user question. Return JSON {"version":"'+ANSWER_VERSION+'","records":[]}. Select the smallest useful set of relevant application record IDs, up to 24; an empty optional selection is allowed. Required records are rendered independently. Do not add prose, values, procedures or source paragraphs. Enabled evidence is not automatically relevant. Registry: '+json.dumps([{k:r[k] for k in ('id','section','text','required')} for r in evidence['records']],ensure_ascii=False,separators=(',',':'))
def render_answer_records(raw,evidence,scope,complete=True):
    selected=[];disposition='incomplete'
    try:
        obj=json.loads(raw)
        if not complete or not isinstance(obj,dict) or sorted(obj)!=['records','version'] or obj['version']!=ANSWER_VERSION or not isinstance(obj['records'],list) or len(obj['records'])>24 or any(not isinstance(i,str) for i in obj['records']) or len(set(obj['records']))!=len(obj['records']):raise ValueError()
        for key in obj['records']:selected.append(next(r for r in evidence['records'] if r['id']==key))
        disposition='validated_envelope'
    except (ValueError,TypeError,StopIteration):selected=[]
    chosen=[r for r in evidence['records'] if r['required'] or any(s['id']==r['id'] for s in selected)];lines=[]
    if disposition=='incomplete':lines+=['⚠ Incomplete answer: provider output did not complete the controlled format. Supported records follow.','']
    interval=scope.get('interval')
    if interval:lines+=[f"{'Historical analysis: ' if scope.get('historical') else ''}{escape(interval.get('start_local') or interval.get('start_utc'))} to {escape(interval.get('end_local') or interval.get('end_utc'))} ({escape(scope.get('timezone'))}; {escape(scope.get('method'))}).",'']
    if scope.get('clarification'):lines+=['Clarification needed: '+escape(scope['clarification']),'']
    if scope.get('assumptions'):lines += [escape(a) for a in scope['assumptions']]+['']
    for section in ['Facts','Possible impacts','Gaps','Suggestions','Sources']:
        rows=[r for r in chosen if r['section']==section]
        if rows:lines+=['## '+section,'']+['- '+r['text'] for r in rows]+['']
    return dict(answer='\n'.join(lines).strip(),disposition=disposition)
