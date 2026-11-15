"""Read-only official NOAA metadata capture; no thresholds are promoted automatically."""
from urllib.request import urlopen
from pathlib import Path
import json,hashlib,datetime
root=Path(__file__).resolve().parents[1]/'docs/long-island/acceptance/threshold-audit-2026-11-14'
root.mkdir(parents=True,exist_ok=True)
manifest=[]
for sid in ['8518750','8516945','8531680','8510560','8518995','8517741']:
    url=f'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/{sid}/floodlevels.json?units=english'
    try:
        with urlopen(url,timeout=15) as r:raw=r.read();status=r.status
        (root/f'{sid}.raw.json').write_bytes(raw)
        manifest.append(dict(station=sid,url=url,status=status,sha256=hashlib.sha256(raw).hexdigest(),retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    except Exception as exc:manifest.append(dict(station=sid,url=url,error=str(exc),retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat()))
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
