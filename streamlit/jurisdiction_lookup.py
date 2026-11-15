"""Server-owned NYS administrative intersections; never geocode a client name or URL."""
import concurrent.futures
import json
import math
import re
from datetime import datetime,timezone
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from selected_location import validate_selected_location,selected_location_question

POLICY=json.loads((Path(__file__).resolve().parents[1]/'shared/jurisdiction-lookup-policy.json').read_text())

def _oriented_ring(ring,clockwise):
    x,y=ring[0]
    area=sum((a[0]-x)*(b[1]-y)-(b[0]-x)*(a[1]-y) for a,b in zip(ring,ring[1:]))
    if area==0:raise ValueError('invalid_query_geometry')
    return ring if (area<0)==clockwise else list(reversed(ring))

def boundary_query(geometry,layer):
    c=geometry['coordinates'];kind=geometry['type']
    if kind=='Point':typ='esriGeometryPoint';shape=dict(x=c[0],y=c[1])
    elif kind=='MultiPoint':typ='esriGeometryMultipoint';shape=dict(points=c)
    elif kind in ('LineString','MultiLineString'):typ='esriGeometryPolyline';shape=dict(paths=[c] if kind=='LineString' else c)
    elif kind in ('Polygon','MultiPolygon'):
        typ='esriGeometryPolygon'
        shape=dict(rings=[_oriented_ring(ring,i==0) for polygon in ([c] if kind=='Polygon' else c) for i,ring in enumerate(polygon)])
    else:raise ValueError('invalid_query_geometry')
    shape['spatialReference']=dict(wkid=4326)
    return dict(f='json',where='1=1',geometryType=typ,geometry=json.dumps(shape,separators=(',',':')),inSR='4326',spatialRel='esriSpatialRelIntersects',outFields=','.join(layer['fields']),returnGeometry='false',resultRecordCount=str(POLICY['max_matches']+1),orderByFields='OBJECTID ASC')

def _text(value,required=False):
    if value is None:
        if required:raise ValueError('invalid_boundary_record')
        return None
    if not isinstance(value,str) or not value.strip() or len(value)>256 or re.search(r'[\x00-\x1f\x7f]',value):raise ValueError('invalid_boundary_record')
    return value.strip()

def normalize_boundary_response(raw,layer,fetched_at):
    if not isinstance(raw,dict) or raw.get('error') or not isinstance(raw.get('features'),list) or raw.get('exceededTransferLimit') is True or len(raw['features'])>POLICY['max_matches']:raise ValueError('incomplete_or_invalid_response')
    matches=[];ids=set()
    for feature in raw['features']:
        p=feature.get('attributes') if isinstance(feature,dict) else None
        oid=p.get('OBJECTID') if isinstance(p,dict) else None
        if not isinstance(oid,int) or isinstance(oid,bool) or oid<0 or oid>9007199254740991 or oid in ids:raise ValueError('invalid_boundary_record')
        ids.add(oid);name=_text(p.get('NAME'),True);fips=_text(p.get('FIPS_CODE'),True)
        if not re.fullmatch(r'\d{'+str(dict(county=5,city_town=10,village=15)[layer['level']])+'}',fips):raise ValueError('invalid_boundary_record')
        kind='County' if layer['level']=='county' else 'Village' if layer['level']=='village' else dict(town='Town',city='City').get(_text(p.get('MUNI_TYPE'),True).lower())
        if kind not in ('County','Village','Town','City'):raise ValueError('invalid_boundary_record')
        modified=None
        if p.get('DATEMOD') is not None:
            at=p['DATEMOD']
            if not isinstance(at,int) or isinstance(at,bool) or at<0 or at>253402300799999:raise ValueError('invalid_boundary_record')
            modified=datetime.fromtimestamp(at/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        matches.append(dict(id=str(oid),name=name,kind=kind,fips=fips,county=_text(p.get('COUNTY')),town=_text(p.get('TOWN')),source_modified_at=modified))
    matches.sort(key=lambda row:int(row['id']))
    return dict(level=layer['level'],layer_id=layer['layer_id'],source_url=f"{POLICY['service_root']}/{layer['layer_id']}/query",fetched_at=fetched_at,status='multiple' if len(matches)>1 else 'matched' if matches else 'no_match',matches=matches,raw_response=raw)

def assemble_jurisdiction(levels):
    required=[l for l in levels if l['level']!='village'];failed=any(l['status']=='unavailable' for l in levels)
    has_required=len(required)==2 and all(l['matches'] for l in required)
    names=[f"{m['kind']}: {m['name']}" for l in levels for m in l['matches']]
    status=('multiple' if any(l['status']=='multiple' for l in levels) else 'matched') if has_required and not failed else 'partial' if names else 'unresolved'
    return dict(version=POLICY['version'],status=status,names=names,source=POLICY['dataset_url'],coverage=POLICY['coverage'],publisher=POLICY['publisher'],publication_date=POLICY['publication_date'],relation='intersects',geometry_reference='selected_location.location.geometry',containment='not_evaluated',levels=levels,reason='Mapped administrative intersections returned.' if has_required and not failed else 'One or more administrative levels lack complete matching evidence.',limitation=POLICY['limitation'])

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def _fetch_layer(url,params):
    request=urllib.request.Request(url,data=urllib.parse.urlencode(params).encode(),headers={'Content-Type':'application/x-www-form-urlencoded'})
    with urllib.request.build_opener(_NoRedirect).open(request,timeout=POLICY['timeout_ms']/1000) as response:
        data=response.read(POLICY['max_response_bytes']+1)
        if len(data)>POLICY['max_response_bytes']:raise ValueError('boundary_response_too_large')
        return json.loads(data)

def lookup_jurisdiction(selected_location,question,fetch_layer=None,clock=None):
    location=validate_selected_location(selected_location)
    if question.strip()!=selected_location_question(location).strip() or location['geometry'] is None:
        return dict(assemble_jurisdiction([]),reason='Selected location does not match this question.' if location['geometry'] else 'Selected geometry is unknown; names and station labels are not geocoded.')
    fetch_layer=fetch_layer or _fetch_layer
    clock=clock or (lambda:datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))
    def query(layer):
        source_url=f"{POLICY['service_root']}/{layer['layer_id']}/query"
        try:return normalize_boundary_response(fetch_layer(source_url,boundary_query(location['geometry'],layer)),layer,clock())
        except Exception as error:
            reason=str(error)
            if isinstance(error,TimeoutError) or isinstance(error,urllib.error.URLError) and isinstance(error.reason,TimeoutError):reason='boundary_timeout'
            elif isinstance(error,urllib.error.HTTPError):reason='boundary_http_error'
            elif reason not in ('invalid_query_geometry','incomplete_or_invalid_response','invalid_boundary_record','boundary_response_too_large'):reason='boundary_retrieval_failed'
            return dict(level=layer['level'],layer_id=layer['layer_id'],source_url=source_url,fetched_at=clock(),status='unavailable',matches=[],reason=reason)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:return assemble_jurisdiction(list(pool.map(query,POLICY['layers'])))
