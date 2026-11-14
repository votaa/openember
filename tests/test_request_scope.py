import copy,json,math,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from request_scope import *
CASES=json.loads((ROOT/'tests/fixtures/scope/request-windows.json').read_text())

CAPTURED=json.loads((ROOT/'docs/long-island/acceptance/cloud-preview-2026-11-14/client-request.json').read_text())
CASES.append(dict(id='captured-point-hourly-grid',question=CAPTURED['messages'][-1]['content'],requestedAt='2026-11-14T14:56:24Z',jurisdiction=CASES[0]['jurisdiction'],weather=CAPTURED['scope_input']['weather'],files=[],expected=dict(status='resolved',method='source_period',start='2026-11-14T23:00:00Z',end='2026-11-15T11:00:00Z')))

def project(c):
    args=dict(question=c['question'],requested_at=c['requestedAt'],jurisdiction=c['jurisdiction'],weather=c['weather'],files=c['files'],policy=c.get('policy'))
    if 'sunrise_clock' in c:args['sunrise_fn']=lambda date,ref:civil(date,c['sunrise_clock'],c['jurisdiction']['timezone']) if c['sunrise_clock'] else math.nan
    scope=resolve_request_scope(**args)
    return dict(scope=scope,weather=scoped_weather(c['weather'],scope),render=render_request_scope(scope,c['weather']))

class ScopeTests(unittest.TestCase):
    def test_shared_fixed_expectations(self):
        for c in CASES:
            with self.subTest(case=c['id']):
                scope=project(c)['scope'];e=c['expected']
                self.assertEqual(scope['status'],e['status']);self.assertEqual(scope['method'],e['method'])
                if e.get('start'):
                    self.assertEqual(scope['interval']['start_utc'],e['start']);self.assertEqual(scope['interval']['end_utc'],e['end'])
                if scope['method']=='assumed':self.assertEqual(instant(scope['interval']['end_utc'])-instant(scope['interval']['start_utc']),57600000)
    def test_captured_source_alignment(self):
        c=copy.deepcopy(CASES[-1]);before=copy.deepcopy(c);out=project(c)
        self.assertEqual(out['scope']['interval']['start_local'],'2026-11-14T18:00:00-05:00')
        hourly=next(s for s in out['weather'] if s['id']=='nws_hourly')
        gust=next(s for s in out['weather'] if s['id']=='nws_grid')['series']['windGust']['values']
        self.assertEqual(len(hourly['periods']),12)
        self.assertIn(dict(validTime='2026-11-14T23:00:00+00:00/PT1H',value=29.632),gust)
        self.assertFalse(any(r['validTime']=='2026-11-14T18:00:00+00:00/PT1H' for r in gust))
        self.assertEqual(c,before)
        c['weather']=[s for s in c['weather'] if s['id']=='nws_hourly']
        self.assertEqual(project(c)['scope']['status'],'clarify')
        for p in c['weather'][0]['data']['properties']['periods']:p['name']='Tonight'
        self.assertEqual(project(c)['scope']['status'],'clarify')

    def test_solar_reference_and_data_gaps(self):
        ms=sunrise('2026-11-14',[40.7891,-73.135])
        self.assertTrue(instant('2026-11-14T11:00:00Z')<ms<instant('2026-11-14T12:00:00Z'))
        self.assertTrue(math.isnan(sunrise('2026-12-21',[89,0])))
        scope=project(CASES[0])['scope']
        source=dict(id='grid',url='https://example.test/grid',geography='Long Island',state='available',data=dict(properties=dict(windGust=dict(uom='wmoUnit:km_h-1',values=[dict(validTime='2026-11-14T13:00:00Z/PT1H',value=50),dict(validTime='2026-11-14T23:00:00Z/PT1H',value=None)]))))
        out=scoped_weather([source],scope)[0]
        self.assertEqual(len(out['series']['windGust']['values']),1);self.assertIsNone(out['series']['windGust']['values'][0]['value']);self.assertEqual(out['series']['windGust']['coverage'],'partial')

if __name__=='__main__':
    if '--projections' in sys.argv:print(json.dumps([project(c) for c in CASES],ensure_ascii=False))
    else:unittest.main()
