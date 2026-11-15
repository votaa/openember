"""Reviewed contextual summaries bound to complete enabled KB module revisions."""
import json,re
from pathlib import Path
CATALOG=json.loads((Path(__file__).resolve().parents[1]/'shared/kb-context-records.json').read_text())
def kb_answer_records(context,question,scope,files=None):
    emergency=bool(re.search(r'\bemergency\s+(?:considerations?|conditions?|assessment|planning)\b',question,re.I))
    wanted=dict(flood=emergency or bool(re.search(r'flood\s+(?:zone|risk|hazard)|flooding',question,re.I)),evacuation=emergency or bool(re.search(r'evacuat|shelter',question,re.I)),infrastructure=emergency or bool(re.search(r'critical\s+(?:facilit|infrastructure)|hospital|trauma',question,re.I)),contacts=emergency or bool(re.search(r'contact|phone|telephone',question,re.I)))
    if scope.get('jurisdiction')!=CATALOG['jurisdiction'] or not any(wanted.values()):return []
    for file in files or []:
        if file.get('content'):context=context.replace(file['content'],'UPLOADED_SOURCE_PROTECTED')
    sections=re.split(r'(?=^--- |^RULES:)',context,flags=re.M);records=[]
    normalize=lambda s:re.sub(r'\s+',' ',s).strip()
    def add(section,text,source,kind):records.append(dict(section=section,text=text,source=source,kind=kind))
    for row in CATALOG['modules']:
        if not wanted[row['topic']]:continue
        prefix=f"--- {row['header']} ---\n";section=next((s for s in sections if s.startswith(prefix)),None)
        if not section:
            if emergency:add('Gaps',f"{row['header']}: no enabled module was supplied for the regional assessment.",row['module'],'kb_gap')
            continue
        if normalize(section[len(prefix):])!=normalize(row['source_text']):
            add('Gaps',f"{row['header']}: this source revision has no reviewed contextual records; its text remains available under Request sources.",row['module'],'kb_gap');continue
        add('Regional KB context',row['text'],row['module'],'kb_context')
    if emergency:add('Gaps','The regional KB listings do not establish the selected location’s flood or evacuation zone, an active evacuation order, open shelters or available medical capacity. Site mapping and current local-source status are needed for those determinations.','application','kb_applicability')
    return records
