"""Conservative geometry relationships; mirrors evidenceLocation.js."""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'config/jurisdiction.generated.json').read_text())
POLICY=json.loads((ROOT/'shared/request-scope-policy.json').read_text())
def valid_point(p):return isinstance(p,list) and len(p)==2 and all(type(n) in (int,float) and math.isfinite(n) for n in p) and abs(p[0])<=180 and abs(p[1])<=90
def positions(g):
    def walk(c):return [c] if valid_point(c) else [p for v in c for p in walk(v)] if isinstance(c,list) else []
    return walk((g or {}).get('coordinates'))
def distance(a,b):
    r=math.pi/180;dlat=(b[1]-a[1])*r;dlon=(b[0]-a[0])*r;x=math.sin(dlat/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin(dlon/2)**2
    return 6371*2*math.asin(min(1,math.sqrt(x)))
def rounded(n):return math.floor(n*1000+.5)/1000
def station_relationship(scope,id):
    selected=scope.get('selected_location') or {};location=selected.get('location') or {};station=next((s for s in CONFIG['nws']['obs_stations'] if s['id']==id),None);vertices=positions(location.get('geometry'));selection=scope.get('observation_selection',{})
    base=dict(status='unknown',basis='No selected geometry.',station_id=id,distances_km=None,limitation='Station measurements are not site conditions; distance does not establish representativeness.')
    if selected.get('status')=='clarify':return dict(base,status='excluded',basis='Location needs clarification.')
    if selection.get('mode')=='named_station' and id not in selection['stations']:return dict(base,status='excluded',basis='A different station was explicitly requested.')
    if not station:return dict(base,status='excluded',basis='Station is not configured.')
    ds=[distance(p,[station['lng'],station['lat']]) for p in vertices]
    if ds:base['distances_km']=dict(minimum_vertex=rounded(min(ds)),maximum_vertex=rounded(max(ds)))
    if location.get('station_id')==id or selection.get('mode')=='named_station':return dict(base,status='station_reference',basis='Explicit station identity; facility footprint is not established.')
    if not location:return dict(base,status='regional_reference',basis='Configured regional station; no site applicability established.')
    if not vertices:return base
    nearest=set()
    for p in vertices:
        candidates=sorted([(distance(p,[s['lng'],s['lat']]),s['id']) for s in CONFIG['nws']['obs_stations']])
        if candidates[0][0]<=POLICY['weather']['nearby_station_max_km']:nearest.add(candidates[0][1])
    return dict(base,status='nearby_reference' if id in nearest else 'excluded',basis='Nearest configured station per supplied geometry vertex within 50 km. Interior/segment coverage and representativeness remain unverified.')
def forecast_relationship(scope,geometry):
    selected=scope.get('selected_location');vertices=positions((selected or {}).get('location',{}).get('geometry'));out=dict(status='unknown',basis='Forecast footprint or selected geometry is missing or unsupported.')
    if not selected:return dict(status='regional_reference',basis='No selected site; regional label does not prove site coverage.')
    if selected['status']!='selected':return dict(status='excluded',basis='Location needs clarification.')
    geometry=geometry or {}
    if not vertices or geometry.get('type')!='Polygon' or len(geometry.get('coordinates',[]))!=1:return out
    ring=geometry['coordinates'][0]
    if not isinstance(ring,list) or len(ring)<4 or len(ring)>512 or not all(valid_point(p) for p in ring) or ring[0]!=ring[-1]:return out
    def cross(a,b,p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    if max(p[0] for p in ring)-min(p[0] for p in ring)>180:return out
    edges=list(zip(ring[:-1],ring[1:]))
    def intersects(e,f):
        a,b=e;c,d=f
        return max(min(a[0],b[0]),min(c[0],d[0]))<=min(max(a[0],b[0]),max(c[0],d[0])) and max(min(a[1],b[1]),min(c[1],d[1]))<=min(max(a[1],b[1]),max(c[1],d[1])) and cross(a,b,c)*cross(a,b,d)<=0 and cross(c,d,a)*cross(c,d,b)<=0
    if any(a==b for a,b in edges):return out
    if any(intersects(edges[i],edges[j]) for i in range(len(edges)) for j in range(i+2,len(edges)) if not (i==0 and j==len(edges)-1)):return out
    turns=[cross(p,ring[(i+1)%(len(ring)-1)],ring[(i+2)%(len(ring)-1)]) for i,p in enumerate(ring[:-1])];turns=[x for x in turns if abs(x)>1e-10]
    if not turns or any(x*turns[0]<0 for x in turns):return out
    inside=all(all(cross(a,ring[i+1],p)*(1 if turns[0]>0 else -1)>=-1e-10 for i,a in enumerate(ring[:-1])) for p in vertices)
    return dict(status='contained' if inside else 'excluded',basis='All supplied geometry vertices tested against a convex, hole-free forecast polygon; convexity also covers connecting segments and interiors. Client source snapshot, not independently verified geography.')
