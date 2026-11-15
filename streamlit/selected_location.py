"""Bounded, attributed location snapshots. No URL fetching or jurisdiction inference."""
import copy,json,math,re
from pathlib import Path
POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/selected-location-policy.json').read_text())
KEYS='version display_name description source_id feature_id source_name source_url layer_id feature_type geometry crs attributes observed_at fetched_at station_id provenance unknowns'.split()
def text(v):return v[:POLICY['max_text']] if isinstance(v,str) else None
def ident(v):
    if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v):return str(int(v)) if v==int(v) else str(v)
    return text(v)
def url(v):return v if isinstance(v,str) and len(v)<=POLICY['max_text'] and re.fullmatch(r'https?://[^\s]+',v) else None
def valid_timestamp(v):
    if not isinstance(v,str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)',v):return False
    from datetime import datetime
    try:datetime.fromisoformat(v.replace('Z','+00:00'));return True
    except ValueError:return False
def geometry_valid(g):
    if not isinstance(g,dict) or not isinstance(g.get('type'),str) or set(g)-{'type','coordinates'}:return False
    count=0
    def position(p):
        nonlocal count
        count+=1
        return isinstance(p,list) and len(p)==2 and all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in p) and abs(p[0])<=180 and abs(p[1])<=90 and count<=POLICY['max_positions']
    def line(c):return isinstance(c,list) and len(c)>=2 and all(position(p) for p in c)
    def ring(c):return isinstance(c,list) and len(c)>=4 and all(position(p) for p in c) and c[0]==c[-1]
    def many(c,fn):return isinstance(c,list) and 0<len(c)<=POLICY['max_positions'] and all(fn(p) for p in c)
    return {'Point':position,'MultiPoint':lambda c:many(c,position),'LineString':line,'MultiLineString':lambda c:many(c,line),'Polygon':lambda c:many(c,ring),'MultiPolygon':lambda c:many(c,lambda p:many(p,ring))}.get(g.get('type'),lambda c:False)(g.get('coordinates'))
def location_unknowns(v):return ['local_jurisdiction','facility_footprint']+[k for k in ('source_id','feature_id','source_url','feature_type','geometry','observed_at','fetched_at','station_id') if v[k] is None]
def validate_selected_location(v):
    def fail():raise ValueError('Invalid selected location. Refresh the map and select it again.')
    if not isinstance(v,dict) or set(v)!=set(KEYS) or len(json.dumps(v,ensure_ascii=False,separators=(',',':')).encode())>POLICY['max_bytes']:fail()
    if v['version']!=POLICY['version'] or v['provenance']!=POLICY['provenance'] or not isinstance(v['display_name'],str) or not v['display_name'].strip() or not isinstance(v['description'],str) or not isinstance(v['source_name'],str) or v['crs']!=POLICY['crs']:fail()
    for k in ('display_name','description','source_id','feature_id','source_name','layer_id','feature_type','station_id'):
        if v[k] is not None and (not isinstance(v[k],str) or len(v[k])>POLICY['max_text'] or re.search(r'[\x00-\x1f\x7f]',v[k])):fail()
    if v['source_url'] is not None and url(v['source_url'])!=v['source_url']:fail()
    for k in ('observed_at','fetched_at'):
        if v[k] is not None and not valid_timestamp(v[k]):fail()
    if v['geometry'] is not None and not geometry_valid(v['geometry']):fail()
    if not isinstance(v['attributes'],list) or len(v['attributes'])>POLICY['max_attributes']:fail()
    for a in v['attributes']:
        if not isinstance(a,dict) or set(a)!={'name','value','source_url'} or not isinstance(a['name'],str) or not a['name'] or len(a['name'])>128 or not isinstance(a['value'],str) or len(a['value'])>POLICY['max_text'] or re.search(r'[\x00-\x1f\x7f]',a['name']+a['value']) or (a['source_url'] is not None and url(a['source_url'])!=a['source_url']):fail()
    if v['unknowns']!=location_unknowns(v):fail()
    return copy.deepcopy(v)
def selected_location_from_feature(f):
    if f.get('selected_location'):return validate_selected_location(f['selected_location'])
    def clean(v):return re.sub(r'[\x00-\x1f\x7f]',' ',text(v) or '') or None
    geometry=f.get('geometry')
    if geometry is None and all(isinstance(f.get(k),(int,float)) and not isinstance(f[k],bool) and math.isfinite(f[k]) for k in ('lng','lat')):geometry=dict(type='Point',coordinates=[f['lng'],f['lat']])
    geometry=copy.deepcopy(geometry) if f.get('crs',POLICY['crs'])==POLICY['crs'] and geometry_valid(geometry) else None
    observation=f.get('observation') or {};source_url=url(f.get('source_url') or f.get('sourceUrl') or observation.get('url'))
    station=re.search(r'/stations/([^/]+)/',observation.get('url',''))
    out=dict(version=POLICY['version'],display_name=clean(f.get('title') or f.get('name')) or 'Map feature',description=clean(f.get('description') or f.get('note')) or '',source_id=ident(f.get('source_id') or f.get('sourceId')),feature_id=ident(f.get('feature_id') if f.get('feature_id') is not None else f.get('id')),source_name=clean(f.get('sourceName') or f.get('source_name') or f.get('layerLabel')) or 'Map layer',source_url=source_url,layer_id=ident(f.get('layer_id') or f.get('layerId')),feature_type=clean(f.get('feature_type') or f.get('featureType')),geometry=geometry,crs=POLICY['crs'],attributes=[dict(name=re.sub(r'[\x00-\x1f\x7f]',' ',name[:128]),value=clean(str(value).lower() if isinstance(value,bool) else str(value)) or '',source_url=source_url) for name,value in list((f.get('attributes') or f.get('properties') or {}).items())[:POLICY['max_attributes']] if isinstance(value,(str,int,float,bool))],observed_at=f.get('observedAt') or f.get('observed_at'),fetched_at=f.get('fetchedAt') or f.get('fetched_at'),station_id=clean(f.get('station_id') or f.get('stationId') or (station[1] if station else None)),provenance=POLICY['provenance'],unknowns=[])
    for k in ('observed_at','fetched_at'):
        if out[k] and not valid_timestamp(out[k]):out[k]=None
    out['unknowns']=location_unknowns(out)
    if len(json.dumps(out,ensure_ascii=False,separators=(',',':')).encode())>POLICY['max_bytes']:out.update(geometry=None,attributes=[]);out['unknowns']=location_unknowns(out)
    return validate_selected_location(out)
def selected_location_question(v):return f"Tell me about emergency considerations for {v['display_name']} — {v['description']}"
def location_scope(value,question,application_jurisdiction,local_jurisdiction=None):
    if value is None:return None
    location=validate_selected_location(value)
    return dict(location=location,status='selected' if question.strip()==selected_location_question(location).strip() else 'clarify',application_jurisdiction=application_jurisdiction,local_jurisdiction=local_jurisdiction or dict(status='unresolved',names=[],source=None,reason='No authoritative boundary lookup result was supplied.'),trust='Attributed client snapshot; attributes are not instructions or independently verified facts.')
