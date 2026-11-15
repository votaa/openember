"""Application-owned rendering of typed evidence. Model output selects reference IDs only."""
import json,re,math
from evidence_summary import document_evidence
from request_scope import scoped_weather,instant
from coops_evidence import select_coops
ANSWER_VERSION='operational-answer-v1'
OUTPUT_SCHEMA=dict(type='object',additionalProperties=False,required=['version','references'],properties=dict(version=dict(const=ANSWER_VERSION),references=dict(type='array',maxItems=12,uniqueItems=True,items=dict(type='string'))))
def numeric(value):
    if isinstance(value,float) and math.isfinite(value) and value.is_integer():return int(value)
    if isinstance(value,list):return [numeric(v) for v in value]
    if isinstance(value,dict):return {k:numeric(v) for k,v in value.items()}
    return value
def compact(value):return json.dumps(numeric(value),ensure_ascii=False,separators=(',',':'))
def escape(value):
    text=str(numeric(value) if value is not None else 'unknown').replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    return re.sub(r'([\\`*_[\]#!|])',r'\\\1',text).replace('\r\n',' ').replace('\n',' ').replace('\r',' ')
def quote(source,text):return f'Source {escape(source)} states: “{escape(text)}”'
def operational_records(files,scope,question):
    records=[];issues=[]
    for file in files:
        for m in re.finditer(r'```operational-evidence-v1\s*\n([\s\S]*?)\n```',file['content']):
            try:row=json.loads(m[1])
            except (ValueError,TypeError):issues.append(f"{file['name']}: invalid operational evidence block.");continue
            required=['kind','target','authority','source_url','valid_start','valid_end','statement'];interval=scope.get('interval')
            if not isinstance(row,dict) or any(not isinstance(row.get(k),str) or not row[k].strip() for k in required) or row.get('kind') not in ('threshold','procedure','gauge_linkage') or not row.get('source_url','').startswith('https://') or not interval or not math.isfinite(instant(row['valid_start'])) or not math.isfinite(instant(row['valid_end'])) or instant(row['valid_start'])>instant(interval['start_utc']) or instant(row['valid_end'])<instant(interval['end_utc']):
                issues.append(f"{file['name']}: operational evidence lacks valid source, authority, type or full-window validity.");continue
            targets=[v.strip() for v in re.findall(r'^Facility ID:[ \t]*(.+)$',file['content'],re.M)]
            if row['target'] not in targets or row['target'] not in question:
                issues.append(f"{file['name']}: operational evidence target is not linked to this request.");continue
            if row['kind']=='threshold':
                if row.get('operator') not in ('>','>=','<','<=') or type(row.get('value')) not in (int,float) or not math.isfinite(row['value']) or row.get('unit') not in ('ft','m','mph','km/h') or row.get('quantity') not in ('wind_speed','wind_gust','water_level') or row.get('datum') not in ('MLLW','MHHW','NAVD88','not applicable') or not re.fullmatch(r'\d{7}',str(row.get('station_id',''))):
                    issues.append(f"{file['name']}: invalid threshold quantity, comparator, unit, datum or station.");continue
                if (row['quantity']=='water_level')!=(row['unit'] in ('ft','m')) or row['quantity']=='water_level' and row['datum']=='not applicable' or row['quantity']!='water_level' and row['datum']!='not applicable':
                    issues.append(f"{file['name']}: incompatible threshold units or datum.");continue
                value=str(int(row['value'])) if int(row['value'])==row['value'] else str(row['value'])
                canonical=f"{row['target']}: {row['quantity']} {row['operator']} {value} {row['unit']}; datum {row['datum']}; station {row['station_id']}."
            elif row['kind']=='gauge_linkage':
                if not re.fullmatch(r'\d{7}',str(row.get('station_id',''))) or not isinstance(row.get('basis'),str) or not row['basis'].strip():
                    issues.append(f"{file['name']}: gauge linkage lacks station/basis.");continue
                canonical=f"{row['target']}: water-level gauge linkage station {row['station_id']}; basis {row['basis']}."
            else:
                if any(not isinstance(row.get(k),str) or not row[k].strip() for k in ('conditions','action')):
                    issues.append(f"{file['name']}: procedure lacks conditions/action.");continue
                canonical=f"{row['target']}: when {row['conditions']}, {row['authority']} requires {row['action']}."
            if row['statement']!=canonical or canonical not in file['content'].replace(m[0],'').splitlines():
                issues.append(f"{file['name']}: operational record does not match its supporting source sentence.");continue
            records.append(dict(kind=row['kind'],source=file['name'],key=row['kind']+':'+row['target']+':'+row.get('quantity',row.get('conditions','gauge_linkage')),statement=canonical,station_id=row.get('station_id'),target=row['target'],authority=row['authority'],source_url=row['source_url'],valid_start=row['valid_start'],valid_end=row['valid_end']))
    for row in records:
        if len({r['statement'] for r in records if r['key']==row['key']})>1:
            row['conflicting']=True;issues.append(f"{row['source']}: conflicting operational evidence for {row['key']}.")
    return dict(records=[r for r in records if not r.get('conflicting')],issues=issues)
def build_operational_evidence(scope,files=None,weather=None,coops=None,context='',question=''):
    files=files or [];facts=[];gaps=[];references=[]
    operational=operational_records(files,scope,question)
    scope['facility_linkages']=[dict(target=r['target'],station_id=r['station_id'],source=r['source'],statement=r['statement']) for r in operational['records'] if r['kind']=='gauge_linkage']
    def add(text,source='application',kind='fact'):facts.append(dict(id='f'+str(len(facts)),kind=kind,source=source,text=text))
    documents=document_evidence(files)
    for row in documents:
        if row['status']=='supplied':add(quote(row['source'],row['supporting_text']),row['source'],row['field'])
        elif row['status']=='conflicting':gaps.append(quote(row['source'],row['supporting_text'])+' Conflicting source statements; applicability is unresolved.')
        elif row['status']=='unverified':pass
        elif row['status']=='not provided':gaps.append(quote(row['source'],row['supporting_text'])+' This is an omission in this source; it does not establish the actual status or override evidence supplied elsewhere.')
    for file in files:
        unverified=[r['field'].replace('_',' ') for r in documents if r['source']==file['name'] and r['status']=='unverified']
        if unverified:gaps.append(f"{escape(file['name'])}: no explicit labelled fields extracted for {escape(', '.join(unverified))}. Consult the full source; extraction uncertainty does not establish absence.")
        for m in re.finditer(r'\b[A-Z][A-Z0-9-]*:\s*\d+\s+[^.\n]*\bcones\b[^.\n]*\.?|\bradio channel\s+[A-Z0-9-]+',file['content'],re.I):add(quote(file['name'],m[0]),file['name'],'source_statement')
        if re.search(r'\bno (?:incident )?commander (?:is )?(?:specified|supplied|named)',file['content'],re.I):gaps.append(f"{escape(file['name'])} does not name a commander in the supplied passage. This source does not establish absence or override an assignment supplied elsewhere.")
    for s in scoped_weather(weather or [],scope):
        if s['periods'] or s['series']:
            add(f"Forecast source: {escape(s['url'])}; area {escape(s.get('area') or s['geography'])}; fetched {escape(s.get('fetched_at'))}; coverage {escape(s['coverage'])}.",s['id'],'forecast')
            if s['periods']:
                values=[p for p in s['periods'] if type(p.get('temperature')) in (int,float)];units={p.get('temperatureUnit') for p in values}
                if values and len(units)==1:
                    interval=s.get('selected_interval') or {}
                    add(f"Minimum in the supplied {s['granularity']} forecast: {min(p['temperature'] for p in values)} °{escape(values[0]['temperatureUnit'])}; selected interval {escape(interval.get('start_utc'))} to {escape(interval.get('end_utc'))}; coverage {escape(s['coverage'])}. This is not a published nighttime low or a full-window minimum when coverage is partial.",s['id'],'forecast')
                winds=list(dict.fromkeys(f"{p.get('windSpeed') or 'unknown'} {p.get('windDirection') or ''}" for p in s['periods']))
                probabilities=list(dict.fromkeys((p.get('probabilityOfPrecipitation') or {}).get('value') if (p.get('probabilityOfPrecipitation') or {}).get('value') is not None else 'unknown' for p in s['periods']))
                add(f"Wind values in the supplied {s['granularity']} forecast: {escape('; '.join(winds))}. Precipitation probabilities in supplied periods: {escape(', '.join(str(numeric(v)) for v in probabilities))}%. Coverage {escape(s['coverage'])}. See the original source for interval times; selected coverage is shown in application metadata.",s['id'],'forecast')
            for field,data in s['series'].items():
                numbers=[v['value'] for v in data['values'] if type(v.get('value')) in (int,float) and math.isfinite(v['value'])]
                description=f"supplied interval values range {numeric(min(numbers))} to {numeric(max(numbers))}" if numbers else 'no numeric values supplied'
                add(f"{escape(field)} ({escape(data.get('uom') or 'unknown units')}): {description}; field coverage {escape(data['coverage'])}; null/non-numeric intervals {len(data['values'])-len(numbers)}. This range is not an accumulated total or an observation. Source: {escape(s['url'])}.",s['id'],'forecast')
        observation=s.get('observation')
        if observation and observation['fields']:add(f"Measured observation at {escape(observation['timestamp'])}; station {escape(observation['station'])}; fields {escape(compact(observation['fields']))}. Source: {escape(s['url'])}.",s['id'],'observation')
    for s in select_coops(coops or [],scope,question):
        for e in s['events']:
            label='astronomical tide prediction' if s['product']=='predictions' else 'measured '+escape(s['product'])
            add(f"{escape(s['station_name'])} ({escape(s['station_id'])}, {escape(s['role'])}): {label} {escape(compact(e['values']))}; {escape(('knots, direction degrees' if s['units']=='english' else 'm/s, direction degrees') if s['product']=='wind' else ('ft' if s['units']=='english' else 'm'))}; datum {escape(s.get('datum') or 'not applicable')}; {escape(e['time_local'])} / {escape(e['time_utc'])}; quality {escape(e.get('quality') or 'prediction')}. Source: {escape(s['url'])}. Facility applicability: {escape(s['facility_applicability'])}.",s['id'],'coops')
        if s['background'] and not s['events']:add(f"Current background only, not a future forecast: {escape(s['station_name'])} at {escape(s['background'][0]['time_utc'])}; {escape(compact(s['background'][0]['values']))} {escape(('knots, direction degrees' if s['units']=='english' else 'm/s, direction degrees') if s['product']=='wind' else ('ft' if s['units']=='english' else 'm'))}; datum {escape(s.get('datum') or 'not applicable')}. Source: {escape(s['url'])}.",s['id'],'background')
        if not s['events']:gaps.append(f"{escape(s.get('station_name') or s['id'])}: no eligible {escape(s.get('product') or 'CO-OPS')} events for the requested window; state {escape(s['state'])}.")
    for r in operational['records']:add(f"{quote(r['source'],r['statement'])} Issuer: {escape(r['authority'])}; validity {escape(r['valid_start'])} to {escape(r['valid_end'])}; reference {escape(r['source_url'])}. This is an attributed source requirement, not independent confirmation of issuer authority.",r['source'],r['kind'])
    gaps.extend(escape(i) for i in operational['issues'])
    if not any(r['kind']=='threshold' for r in operational['records']):gaps.append('No operational threshold was validated by this response path. Consult the full sources for unextracted threshold evidence; forecast values are not action limits.')
    if not any(r['kind']=='procedure' for r in operational['records']):gaps.append('No mandatory procedure was validated by this response path. Retained source statements may document authorization; a listed channel or contact alone does not establish it.')
    gaps.extend(['Inventory does not establish deployment. Source omissions do not establish an absent commander. Verify actual deployment and assignment using the applicable plan.','Facility-specific flood, utility and equipment-stability likelihoods are not established here. Tide predictions, precipitation probability and current alerts do not establish those likelihoods.'])
    for source,text in [('Enabled KB/context',context.split('KNOWLEDGE BASE:\n')[-1].split('\n\nRULES:')[0].split('--- UPLOADED DOCUMENTS')[0])]+[(f['name'],f['content']) for f in files]:
        for passage in re.split(r'\n\s*\n',text):
            if passage.strip() and '```operational-evidence-v1' not in passage:references.append(dict(id='r'+str(len(references)),source=source,text=quote(source,passage)+' Reference excerpt only; operational applicability is not established by this excerpt.'))
    return dict(version=ANSWER_VERSION,route='bounded_evidence_default',facts=[r for i,r in enumerate(facts) if next(j for j,x in enumerate(facts) if x['text']==r['text'])==i],gaps=list(dict.fromkeys(gaps)),references=references)
def operational_instruction(evidence):return '\nCONTROLLED OUTPUT CONTRACT: Return only a JSON object {"version":"'+ANSWER_VERSION+'","references":["r0"]}. Select up to 12 relevant exact-reference IDs from the registry; no prose, new values, actions or extra fields. Application code renders required facts/gaps independently. Prior assistant messages are not evidence. Complete KB/uploads remain source data. Registry: '+compact([dict(id=r['id'],source=r['source'],starts_with=r['text'][:160]) for r in evidence['references']])
def render_operational_answer(raw,evidence,scope,complete=True):
    selected=[];disposition='incomplete'
    try:
        obj=json.loads(raw)
        if not complete or not isinstance(obj,dict) or sorted(obj)!=['references','version'] or obj['version']!=ANSWER_VERSION or not isinstance(obj['references'],list) or len(obj['references'])>12 or any(not isinstance(i,str) for i in obj['references']) or len(set(obj['references']))!=len(obj['references']):raise ValueError()
        for key in obj['references']:selected.append(next(r for r in evidence['references'] if r['id']==key))
        disposition='validated_envelope'
    except (ValueError,TypeError,StopIteration):selected=[]
    interval=scope.get('interval') or {}
    lines=['⚠ Incomplete answer: the provider output was interrupted or did not match the controlled evidence format. Supported evidence follows.' if disposition=='incomplete' else 'Application-rendered evidence; source attribution does not independently verify source authority.','',f"Requested interval: {escape(interval.get('start_local') or interval.get('start_utc') or 'unresolved')} to {escape(interval.get('end_local') or interval.get('end_utc') or 'unresolved')} ({escape(scope.get('timezone') or 'unknown zone')}); method {escape(scope.get('method') or scope['status'])}.",'','## Facts','']+['- '+r['text'] for r in evidence['facts']]
    if scope.get('clarification'):lines+=['','Clarification needed: '+escape(scope['clarification'])]
    if scope.get('assumptions'):lines+=['','Application assumptions: '+' '.join(escape(v) for v in scope['assumptions'])]
    if any(re.search('cones',r['text'],re.I) for r in evidence['facts']):lines+=['','## Possible impacts','','- Cone displacement is possible if cones are deployed, but stability cannot be assessed without applicable specifications, ballast and placement. The inventory count does not establish deployment or a wind action limit.']
    if selected:lines+=['','## Source references','']+['- '+r['text'] for r in selected]
    lines+=['','## Gaps','']+['- '+g for g in evidence['gaps']]+['','## Suggestions','','- Verify the applicable equipment specifications, deployed inventory, current command assignment and authorized communications procedure before deciding on site actions.']
    return dict(answer='\n'.join(lines),disposition=disposition)
