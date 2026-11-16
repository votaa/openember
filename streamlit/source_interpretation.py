"""Source-format adapters; source assertions do not establish live status or authority."""
import json,re,math
from pathlib import Path
from request_scope import instant
from answer_records import escape,document_value
from evidence_summary import document_evidence
BOUNDARY=json.loads((Path(__file__).resolve().parents[1]/'shared/jurisdiction-lookup-policy.json').read_text())
SYNTHESIS_POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/location-synthesis-policy.json').read_text())
COUNTY_FIPS=dict(Nassau='36059',Suffolk='36103')
def county_references(scope):
    selected=scope.get('selected_location') or {};local=selected.get('local_jurisdiction') or {}
    if selected.get('status')!='selected' or not selected['location'].get('geometry') or local.get('version')!=BOUNDARY['version'] or local.get('relation')!='intersects' or local.get('geometry_reference')!='selected_location.location.geometry':return []
    layer=next((l for l in local.get('levels',[]) if l['level']=='county'),None)
    age=instant(scope.get('request_utc'))-instant((layer or {}).get('fetched_at'))
    if not layer or layer.get('layer_id')!=2 or layer.get('source_url')!=BOUNDARY['service_root']+'/2/query' or layer.get('status') not in ('matched','multiple') or not math.isfinite(age) or age< -SYNTHESIS_POLICY['boundary_future_tolerance_seconds']*1000 or age>3600000:return []
    return [dict(name=m['name'],fips=m['fips'],source_url=layer['source_url'],fetched_at=layer['fetched_at'],relation='intersects',containment='not_established') for m in layer.get('matches',[]) if m.get('kind')=='County' and m.get('name') in COUNTY_FIPS and COUNTY_FIPS[m['name']]==m.get('fips')]
def length(text):return len(text.encode('utf-16-le'))//2
def utf16(text,start,end):return text.encode('utf-16-le')[start*2:end*2].decode('utf-16-le')
def source_lines(text):
    out=[];offset=0;fence=None
    for line in text.split('\n'):
        mark=re.match(r'^\s*(`{3,}|~{3,})(.*)$',line)
        if mark:
            if fence is None:fence=dict(char=mark[1][0],length=len(mark[1]))
            elif fence['char']==mark[1][0] and len(mark[1])>=fence['length'] and not mark[2].strip():fence=None
        elif fence is None:out.append(dict(line=line.removesuffix('\r'),start=offset))
        offset+=length(line)+1
    return out

def interpret_source_formats(scope,bundle,files=None,context=''):
    files=files or [];selected=scope.get('selected_location') or {}
    if selected.get('status')!='selected':return dict(rows=[],gaps=[])
    target=selected['location']['display_name'];counties=county_references(scope);rows=[];gaps=[]
    for source in [s for s in bundle['sources'] if s['kind'] in ('upload','enabled_context')]:
        raw=source['raw'];text=files[raw['index']]['content'] if source['kind']=='upload' else utf16(context,raw['start'],raw['end'])
        if source['kind']=='enabled_context' and any(f.get('content') and f['content'] in text for f in files):continue
        attribution=source['source'].get('name') or source['source'].get('id')
        def add(row,start,end):
            rows.append(dict(row,source_id=source['id'],time=dict(disposition='source_validity_unresolved'),excerpt=dict(raw,**dict(start=raw.get('start',0)+start,end=raw.get('start',0)+end,offset_unit='utf16',text=utf16(text,start,end))),attribution=attribution))
        for item in source_lines(text):
            line=item['line'];start=item['start']
            hospital=re.fullmatch(r'(?:Hospitals — )?(Nassau|Suffolk) Level (?:[123](?: Trauma \(\d+\))?|3 / East End): (.+)',line)
            if hospital:
                entry_start=length(line[:line.index(': ')+2])
                for part in hospital[2].split(';'):
                    trimmed=part.strip();name=re.sub(r' \([^()]*\)$','',trimmed.removesuffix('.'))
                    if name.lower()==target.lower():
                        begin=start+entry_start+length(part[:part.index(trimmed)])
                        add(dict(relation='hospital_listing',subject=target,value=True,description=f"{escape(attribution)} lists {escape(target)} in its {hospital[1]} hospital section. The listing does not verify current designation, receiving capacity or access.",location=dict(status='source_named_target',basis='Exact hospital entry name matches the selected display name; listed county is a source assertion, not a geometry lookup.',listed_county=hospital[1]),qualifiers=trimmed[len(name):]),begin,begin+length(trimmed))
                        if re.search(r'pending|as of|\b20\d\d\b',trimmed,re.I):gaps.append('The selected hospital entry contains dated or pending designation language; no current designation is established.')
                    entry_start+=length(part)+1
            contact=re.fullmatch(r'(Nassau|Suffolk) OEM: (\d{3}-\d{3}-\d{4})((?: \| [^|\r\n]+)*)',line)
            if contact:
                tails=[v for v in contact[3].split(' | ') if v]
                if any(not re.fullmatch(r"\d+ [A-Za-z0-9 .,'-]+",v) and not re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:/[a-z0-9/_-]*)?',v) for v in tails):continue
                reference=next((c for c in counties if c['name']==contact[1]),None)
                if not reference:continue
                add(dict(relation='coordination_contact',subject=contact[1]+' OEM',value=contact[2],description=f"{escape(attribution)} lists {contact[1]} OEM telephone {contact[2]}. Supplied geometry intersects {contact[1]} County; this is a county coordination reference, not a finding of full containment, command assignment or authority. Verify the contact's current validity.",location=dict(status='county_intersection_reference',basis='Recorded NYS boundary intersection selects a county reference; it does not establish emergency authority.',boundary=reference),qualifiers=None),start,start+length(line))
        if source['kind']=='upload':
            visible=source_lines(text);ids=[m[1].strip() for l in visible if (m:=re.fullmatch(r'Facility ID:[ \t]*([^\r\n]+)',l['line']))]
            if len(ids)!=1 or ids[0]!=target:continue
            for row in document_evidence([dict(name=source['source']['name'],content='\n'.join(l['line'] for l in visible))]):
                if row['field'] not in ('inventory','deployment') or row['status'] not in ('supplied','conflicting'):continue
                value=document_value(row);line=next((l for l in visible if l['line']==row.get('supporting_text')),None)
                if value is None or not line:continue
                add(dict(relation=row['field']+'_listing',subject=target,value=value,description=f"{escape(attribution)} lists {row['field']} for {escape(target)}: {escape(value)}. This is a source-reported document assertion; current inventory and deployment are unverified.",location=dict(status='source_named_target',basis='Exact selected display name matches the single Facility ID in the uploaded source.'),qualifiers=None),line['start'],line['start']+length(line['line']))
    return dict(rows=rows,gaps=gaps)
