"""Typed source interpretation shared by checkpoint and selected-location routing."""
import copy,json,math
from pathlib import Path
from operational_evidence import build_operational_evidence
from answer_records import escape
from source_interpretation import interpret_source_formats,source_lines
POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/location-synthesis-policy.json').read_text())
SYNTHESIS_VERSION=POLICY['version']
def utf16(text,start,end):return text.encode('utf-16-le')[start*2:end*2].decode('utf-16-le')
def length(text):return len(text.encode('utf-16-le'))//2
def assertions(text,target):
    out=[]
    for item in source_lines(text):
        line=item['line'];start=item['start']
        for relation in [r for r in POLICY['relations'] if not r.get('adapter_only')]:
            for verb,value in [(' has ',True),(' does not have ',False)]:
                statement=target+verb+relation['noun']+'.'
                if line==statement:out.append(dict(relation=relation['id'],value=value,statement=statement,start=start,end=start+length(line)))
    return out

def build_synthesis_checkpoint(scope,files=None,weather=None,coops=None,context='',question='',prepared_evidence=None):
    files=files or [];scope=copy.deepcopy(scope)
    evidence=prepared_evidence if prepared_evidence is not None else build_operational_evidence(scope,files,weather,coops,context,question);bundle=scope['evidence_bundle']
    selected=scope.get('selected_location');active=bool(selected and selected['status']=='selected');target=selected['location']['display_name'] if active else None
    claims=[];candidates=[];gaps=[]
    def add(claim,category,interpretation,text,section):
        claims.append(claim);candidates.append(dict(proposal=dict(category=category,claim_id=claim['id'],source_id=claim['source_id'],interpretation=interpretation,value=claim['value']),text=text,section=section))
    for record in evidence['records']:
        if active and record['kind'] in ('location','jurisdiction','observation','latest_reported','forecast','coops'):
            original=next((c for c in bundle['claims'] if c['id']==record.get('claim_id')),None)
            if not original:continue
            category='weather_fact' if record['kind'] in ('observation','latest_reported','forecast','coops') else 'location_fact'
            add(dict(id=record['claim_id'],source_id=record['source_id'],value=record['text'],location=original['location'],time=original['time'],category=category),category,'report',record['text'],'Facts')
    if active:
        for source in [s for s in bundle['sources'] if s['kind'] in ('upload','enabled_context')]:
            raw=source['raw'];text=files[raw['index']]['content'] if source['kind']=='upload' else utf16(context,raw['start'],raw['end'])
            if source['kind']=='enabled_context' and any(f.get('content') and f['content'] in text for f in files):continue
            for row in assertions(text,target):
                claim=dict(id='x'+str(len(claims)),source_id=source['id'],category='source_assertion',relation=row['relation'],value=row['value'],target=target,location=dict(status='source_named_target',basis='Exact selected display name in source; identity and applicability are not independently verified.'),time=dict(disposition='source_validity_unresolved'),excerpt=dict(raw,**dict(start=raw.get('start',0)+row['start'],end=raw.get('start',0)+row['end'],offset_unit='utf16',text=row['statement'])))
                attribution=source['source'].get('name') or source['source'].get('id')
                add(claim,'source_assertion','attribute',f"{escape(attribution)} states: “{escape(row['statement'])}” This is an attributed source assertion; current status and independent site applicability are unverified.",'Source-supported context')
    interpreted=interpret_source_formats(scope,bundle,files,context)
    for row in interpreted['rows']:
        detail={k:v for k,v in row.items() if k not in ('description','attribution')}
        add(dict(id='x'+str(len(claims)),category='source_assertion',target=target,**detail),'source_assertion','attribute',row['description'],'Source-supported context')
    gaps+=interpreted['gaps']
    assertions_only=[c for c in claims if c['category']=='source_assertion']
    for relation in POLICY['relations']:
        relation_rows=[c for c in assertions_only if c['relation']==relation['id']]
        for subject in dict.fromkeys(c.get('subject') or target for c in relation_rows):
            rows=[c for c in relation_rows if (c.get('subject') or target)==subject]
            if len({c['value'] for c in rows})>1:
                gaps.append(f"Supplied sources conflict about {relation['noun']} at {escape(subject)}. Both assertions are retained; no precedence or current status is established.");continue
            if rows:
                claim=rows[0];candidates.append(dict(proposal=dict(category='conditional_consideration',claim_id=claim['id'],source_id=claim['source_id'],interpretation='verify_'+relation['id'],value=claim['value']),text=relation['check'],section='Conditional considerations'))
    weather_claim=next((c for c in claims if c['category']=='weather_fact' and c['time'].get('disposition') in ('current_observation','latest_reported') and any(x['source_id']==c['source_id'] and any(type(x.get('payload',{}).get('fields',{}).get(k,{}).get('value')) in (int,float) and math.isfinite(x['payload']['fields'][k]['value']) for k in ('windSpeed','windGust')) for x in bundle['claims'])),None)
    feature_type=selected['location'].get('feature_type') if active else None
    if weather_claim and feature_type in POLICY['feature_checks']:
        candidates.append(dict(proposal=dict(category='conditional_consideration',claim_id=weather_claim['id'],source_id=weather_claim['source_id'],interpretation='feature_'+feature_type,value=weather_claim['value']),text=POLICY['feature_checks'][feature_type],section='Conditional considerations'))
    if active and feature_type not in POLICY['feature_checks']:gaps.append('Feature type or relevant site context is unresolved; obtain site-linked descriptive evidence before assigning feature-specific considerations.')
    if not active:gaps.append('Confirm the selected location before synthesizing site evidence.')
    gaps += [r['text'] for r in evidence['records'] if r['section']=='Gaps' and not r['kind'].startswith('kb_')]
    gaps.append('Only supported descriptive relations and bounded facts are represented. Other enabled source text remains available for review; missing extraction does not establish absence, safe conditions or normal operations.')
    if not assertions_only and not weather_claim:gaps.append('Obtain a site-linked source describing relevant conditions and a valid observation or applicable forecast before assessing hazards. Location identity alone is insufficient.')
    return dict(version=SYNTHESIS_VERSION,scope=scope,claims=claims,candidates=candidates,gaps=list(dict.fromkeys(gaps)),coverage=dict(location='selected' if active else 'unresolved',weather='bounded_facts_available' if any(c['category']=='weather_fact' for c in claims) else 'unresolved',source_assertions=len(assertions_only),adapter_claims=len(interpreted['rows']),unrepresented_source_text=True),operational=dict(route='existing_source_scoped_validator_only',eligible_records=[r for r in evidence['records'] if r['kind'] in ('threshold','procedure','gauge_linkage')]))

def synthesis_instruction(checkpoint):
    return '\nSYNTHESIS CHECKPOINT CONTRACT: Return JSON with only version and statements. Version: '+SYNTHESIS_VERSION+'. Statements are exact proposal objects chosen from this request registry. Select source-supported facts and useful conditional considerations. No prose, additional values, local findings, operational directions or new references. References and interpretation compatibility are independently checked. Registry: '+json.dumps([c['proposal'] for c in checkpoint['candidates']],ensure_ascii=False,separators=(',',':'))
def render_synthesis_proposal(raw,checkpoint,complete=True):
    accepted=[];rejected=[];format_status='valid'
    try:
        obj=json.loads(raw)
        if not complete or not isinstance(obj,dict) or sorted(obj)!=['statements','version'] or obj['version']!=SYNTHESIS_VERSION or not isinstance(obj['statements'],list) or len(obj['statements'])>32:raise ValueError()
    except (ValueError,TypeError):format_status='invalid_or_incomplete';obj=dict(statements=[])
    for index,item in enumerate(obj['statements']):
        claim=next((c for c in checkpoint['claims'] if isinstance(item,dict) and c['id']==item.get('claim_id')),None)
        source=next((s for s in checkpoint['scope']['evidence_bundle']['sources'] if isinstance(item,dict) and s['id']==item.get('source_id')),None)
        # JSON booleans and numbers are distinct protocol values.
        equal=lambda a,b:type(a)==type(b) and a==b
        candidate=next((c for c in checkpoint['candidates'] if isinstance(item,dict) and sorted(item)==['category','claim_id','interpretation','source_id','value'] and all(equal(v,item[k]) for k,v in c['proposal'].items())),None)
        if not candidate or not claim or not source or claim['source_id']!=source['id'] or not equal(claim['value'],item.get('value')):
            rejected.append(dict(index=index,reason='unsupported_reference_value_category_or_interpretation'));continue
        if candidate not in accepted:accepted.append(candidate)
    chosen=[c for c in checkpoint['candidates'] if c['proposal']['category']!='conditional_consideration' or c in accepted]
    useful=[c for c in accepted if c['proposal']['category']=='conditional_consideration']
    fallback=format_status!='valid' or bool(rejected) or not useful
    if fallback:
        for c in checkpoint['candidates']:
            if c['proposal']['category']=='conditional_consideration' and c not in chosen:chosen.append(c)
    lines=[]
    if fallback:lines+=['Limited synthesis: unsupported or incomplete proposal content was withheld; supported facts and checks follow.','']
    for section in ['Facts','Source-supported context','Conditional considerations']:
        rows=[c for c in chosen if c['section']==section]
        if rows:lines+=['## '+section,'']+['- '+c['text'] for c in rows]+['']
    lines+=['## Material gaps','']+['- '+g for g in checkpoint['gaps']]
    return dict(answer='\n'.join(lines).strip(),validation=dict(format=format_status,claims=dict(accepted=len(accepted),rejected=rejected),evidence_coverage=checkpoint['coverage'],response_completeness='supported_fallback' if fallback else 'bounded_synthesis',operational_verification='not_established'))
