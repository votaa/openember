# Local recording-only Streamlit walkthrough. All remote transports are replaced.
import os,sys,json,runpy,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'streamlit'))
os.environ['OLLAMA_API_KEY']='recording-only';os.environ['OLLAMA_HOST']='https://ollama.com';os.environ['OLLAMA_MODEL']='local-recording'
CAPTURE=Path(os.environ.get('EMBER_FIXTURE_CAPTURE_DIR','/private/tmp/openember-live-synthesis-streamlit'));CAPTURE.mkdir(parents=True,exist_ok=True)
import requests,jurisdiction_lookup
cases=json.loads((ROOT/'tests/fixtures/locations/source-adapters.json').read_text());weather=next(x for x in cases if x['name']=='hospital-real-kb')['weather']
def request(self,method,url,**kwargs):
    response=requests.Response();response.url=url;response._content_consumed=True;response.status_code=503;response._content=b'{}'
    if method.upper()=='POST' and url=='https://ollama.com/api/chat':
        body=kwargs['json'];system=body['messages'][0]['content'];syn='SYNTHESIS CHECKPOINT CONTRACT' in system
        registry=json.loads(system.rsplit('Registry: ',1)[1].split(' All supported facts and material gaps render independently.')[0]) if syn else []
        content=json.dumps(dict(version='location-synthesis-proposal-v1',statements=registry) if syn else dict(version='operational-answer-v2',records=[]))
        log=CAPTURE/'provider-requests.json';calls=json.loads(log.read_text()) if log.exists() else [];calls.append(body);log.write_text(json.dumps(calls,indent=2))
        response.status_code=200;response._content=(json.dumps(dict(model='local-recording',message=dict(content=content),done=True,done_reason='stop'))+'\n').encode()
    elif '/stations/' in url and '/observations/latest' in url:
        source=next((s for s in weather if s['url']==url),None)
        if source:
            data=json.loads(json.dumps(source['data']));data['properties']['timestamp']=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=4030)).isoformat(timespec='seconds');response.status_code=200;response._content=json.dumps(data).encode()
    return response
requests.sessions.Session.request=request
# Real lookup normalization and geometry query; only the transport is replaced.
def layer(url,params):
    g=json.loads(params['geometry']);kind='hospital' if g.get('x')==-73.6993 and g.get('y')==40.7765 else 'kfrg' if g.get('x') in (-73.4138,-73.4134) and g.get('y')==40.7288 else None;id=url.split('/')[-2]
    if kind is None:raise ValueError('Unknown boundary fixture geometry')
    return json.loads((ROOT/f'tests/fixtures/jurisdiction/{kind}-{id}.json').read_text())
jurisdiction_lookup._fetch_layer=layer
import streamlit as st
try:
    runpy.run_path(str(ROOT/'streamlit/app.py'),run_name='__main__')
finally:
    if 'messages' in st.session_state:(CAPTURE/'history.json').write_text(json.dumps(list(st.session_state.messages),indent=2,default=str))
