"""Source-scoped operational record validation; query rendering is shared in shape with Edge."""
import json,re,math
from request_scope import instant
from answer_records import ANSWER_VERSION,OUTPUT_SCHEMA,build_answer_records,answer_instruction,render_answer_records
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
            if row['target'] not in targets or row['target'] not in re.findall(r'[A-Za-z0-9_-]+',question):
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
            records.append(dict(kind=row['kind'],source=file['name'],key=row['kind']+':'+row['target']+':'+row.get('quantity',row.get('conditions','gauge_linkage')),statement=canonical,action=row.get('action') if row['kind']=='procedure' else None,conditions=row.get('conditions') if row['kind']=='procedure' else None,station_id=row.get('station_id'),target=row['target'],authority=row['authority'],source_url=row['source_url'],valid_start=row['valid_start'],valid_end=row['valid_end']))
    for row in records:
        if len({r['statement'] for r in records if r['key']==row['key']})>1:
            row['conflicting']=True;issues.append(f"{row['source']}: conflicting operational evidence for {row['kind']} at {row['target']}.")
    return dict(records=[r for r in records if not r.get('conflicting')],issues=issues)
def build_operational_evidence(scope,files=None,weather=None,coops=None,context='',question=''):
    operational=operational_records(files or [],scope,question)
    scope['facility_linkages']=[dict(target=r['target'],station_id=r['station_id'],source=r['source'],statement=r['statement']) for r in operational['records'] if r['kind']=='gauge_linkage']
    return build_answer_records(scope,files,weather,coops,context,question,operational)
operational_instruction=answer_instruction
render_operational_answer=render_answer_records
