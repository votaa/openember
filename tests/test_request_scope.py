import copy,json,math,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from request_scope import *
CASES=json.loads((ROOT/'tests/fixtures/scope/request-windows.json').read_text())

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
