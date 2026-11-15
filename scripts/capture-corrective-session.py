"""Capture configured public evidence once. Retain exact bytes and failed source responses."""
import concurrent.futures,datetime,hashlib,json,sys
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
if (out/'weather-capture.json').exists():raise SystemExit('Existing capture will not be overwritten')
cfg=json.loads((root/'config/jurisdiction.generated.json').read_text());nws=cfg['nws'];base=f"https://api.weather.gov/gridpoints/{nws['office']}/{nws['grid_x']},{nws['grid_y']}"
sources=[('nws_forecast','7-Day Forecast — LI',base+'/forecast'),('nws_hourly','Hourly Forecast',base+'/forecast/hourly'),('nws_grid','Wind & Precip Grid',base),('nws_alerts','Active Alerts — NY','https://api.weather.gov/alerts/active?area=NY'),('nws_obs_kjfk','Observations — JFK Airport','https://api.weather.gov/stations/KJFK/observations/latest')]
for sid,key,name,date in [('8518750','battery','The Battery','recent'),('8516945','kings','Kings Point','latest'),('8510560','montauk','Montauk','latest'),('8531680','sandy','Sandy Hook','latest')]:
    sources.append(('coops_'+key,'Water Level — '+name,f'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date={date}&station={sid}&product=water_level&datum=MLLW&time_zone=gmt&units=english&format=json&application=EMBER'))
sources.extend([('coops_preds','Tidal Predictions — Battery 48h','https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=today&range=48&station=8518750&product=predictions&datum=MLLW&time_zone=gmt&interval=hilo&units=english&format=json&application=EMBER'),('coops_wind','Wind — The Battery','https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=wind&time_zone=gmt&units=english&format=json&application=EMBER')])
def capture(source):
    key,name,url=source;start=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds");status=None;error=None;raw=b'';headers={}
    try:
        with urlopen(Request(url,headers={'User-Agent':'OpenEmber/1.0 corrective-acceptance','Accept':'application/json'}),timeout=25) as response:
            status=response.status;raw=response.read();headers={k:v for k,v in response.headers.items() if k.lower() in ('date','last-modified','etag','content-type')}
    except HTTPError as exc:status=exc.code;raw=exc.read();error=str(exc)
    except Exception as exc:error=str(exc)
    filename=key+'.raw.json';(out/filename).write_bytes(raw)
    try:data=json.loads(raw)
    except (ValueError,TypeError):data=None
    if isinstance(data,dict) and data.get('error'):error=str(data['error'])
    row=dict(ep=dict(id=key,name=name,url=url),ok=status==200 and data is not None and not error,data=data,fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),error=error)
    manifest=dict(id=key,url=url,started_at=start,fetched_at=row['fetchedAt'],status=status,ok=row['ok'],error=error,headers=headers,file=filename,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
    return row,manifest
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:captured=list(pool.map(capture,sources))
(out/'weather-capture.json').write_text(json.dumps([r for r,m in captured],indent=2)+'\n')
(out/'source-manifest.json').write_text(json.dumps([m for r,m in captured],indent=2)+'\n')
print(json.dumps([dict(id=m['id'],ok=m['ok'],status=m['status'],bytes=m['bytes']) for r,m in captured],indent=2))
