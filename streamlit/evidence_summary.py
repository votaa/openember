"""Conservative source navigation; never substitutes for complete source text."""
import json,re
from pathlib import Path
from request_scope import scoped_weather
FIELDS=json.loads((Path(__file__).resolve().parents[1]/'shared/evidence-fields.json').read_text())

def document_evidence(files=None):
    rows=[]
    for file in files or []:
        for field,labels in FIELDS.items():
            matches=list(re.finditer('^('+ '|'.join(labels)+r')[ \t]*:[ \t]*([^\n\r]*)\r?$',file.get('content',''),re.I|re.M))
            if not matches:rows.append(dict(source=file['name'],field=field,status='unverified',limitation='No explicit labelled field extracted from this source; consult full text. This does not establish absence.'))
            for m in matches:
                value=m[2].strip()
                rows.append(dict(source=file['name'],field=field,status='not provided' if not value or re.fullmatch(r'unknown|unspecified|not (?:provided|specified|named|supplied)|tbd',value,re.I) else 'supplied',supporting_text=m[0],value=value,limitation='Labelled source statement; applicability and authority require source review.'))
    supplied={k:{r['value'] for r in rows if r['field']==k and r['status']=='supplied'} for k in FIELDS}
    for row in rows:
        if row['status']=='supplied' and len(supplied[row['field']])>1:row['status']='conflicting'
    return rows

def weather_navigation(weather,scope):
    rows=scoped_weather(weather or [],scope)
    for row in rows:
        periods=row.pop('periods');series=row.pop('series')
        row['period_samples']=[dict(start=p['startTime'],end=p['endTime'],temperature=p.get('temperature'),temperature_unit=p.get('temperatureUnit'),wind=p.get('windSpeed'),wind_direction=p.get('windDirection'),precipitation_probability=p.get('probabilityOfPrecipitation')) for p in periods[:3]]
        row['period_count']=len(periods)
        row['fields']={field:dict(unit=data['uom'],coverage=data['coverage'],interval_count=len(data['values']),null_count=sum(v.get('value') is None for v in data['values']),samples=data['values'][:3]) for field,data in series.items()}
        row['limitations']='Navigation samples only; consult complete WINDOW MATCHES. Original intervals retained; coverage applies only to selected segment. Null fields are unknown. No full-window aggregate calculated. Hourly minima are not published nighttime lows.'
    return rows


def evidence_summary(scope,weather,files=None):
    from request_scope import instant
    gaps=['Facility applicability is unknown unless source-backed location evidence connects the facility to the supplied station or forecast area.']
    if scope.get('interval') and instant(scope['interval']['start_utc'])<instant(scope['request_utc']):gaps.append('Past/current weather requires applicable fresh observations; latest-only feeds cannot establish complete historical coverage.')
    return 'SOURCE FACTS AND KNOWN GAPS (navigation aid; full KB and uploads remain authoritative source text):\n'+json.dumps(dict(weather=weather_navigation(weather,scope),documents=document_evidence(files),gaps=gaps),ensure_ascii=False,separators=(',',':'))+'\n'


def strip_weather_context(context,files=None):
    protected=[f["content"] for f in files or []]
    for i,text in enumerate(protected):
        if text:context=context.replace(text,f"EMBER_DOCUMENT_{i}_PROTECTED")
    pattern=r'^(\[(?:NOAA|NWS)[^\n]*\n[\s\S]*?)(?=^\[|^--- |^RULES:|^AUTHORITATIVE |\Z)'
    def clean(section):
        if section.startswith('--- UPLOADED DOCUMENTS'):return section
        return re.sub(pattern,lambda m:'' if re.search(r'https://api\.weather\.gov/(?:gridpoints/|stations/[^\s]+/observations)',m[0],re.I) else m[0],section,flags=re.M)

    cleaned=''.join(clean(section) for section in re.split(r'(?=^--- )',context,flags=re.M))

    for i,text in enumerate(protected):cleaned=cleaned.replace(f"EMBER_DOCUMENT_{i}_PROTECTED",text)
    return cleaned
