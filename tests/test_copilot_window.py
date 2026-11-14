import json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from copilot_window import resolve_window,request_windows,covers_window,overlaps
from copilot_forecast import forecast_periods,context_forecast_periods
DATA=json.loads((ROOT/'shared/copilot/fixtures/date-windows.json').read_text())


def projections():
    return [resolve_window(c['period'],c['at'],DATA['timezone']) for c in DATA['cases']]


class WindowTests(unittest.TestCase):
    def test_shared_calendar_contract(self):
        for c,actual in zip(DATA['cases'],projections()):
            with self.subTest(case=c['id']):
                self.assertEqual(actual,dict(start=c['start'],end=c['end'],timezone=DATA['timezone']) if 'start' in c else None)

    def test_timestamps_override_misleading_names_and_exclusive_boundaries(self):
        request=dict(question='Monday weather',requested_at='2026-11-14T17:00:00Z',jurisdiction=dict(timezone=DATA['timezone']),history=[])
        rows=[dict(name='Monday',isDaytime=True,startTime='2026-11-09T06:00:00-05:00',endTime='2026-11-09T18:00:00-05:00'),dict(name='Wrong label',isDaytime=True,startTime='2026-11-16T06:00:00-05:00',endTime='2026-11-16T18:00:00-05:00')]
        self.assertEqual(forecast_periods(rows,dict(period='monday',timezone=DATA['timezone'],fields=['high']),request['requested_at']),rows[1:])
        self.assertEqual(context_forecast_periods(request,rows),rows[1:])
        window=request_windows(request)['windows'][0]
        self.assertFalse(covers_window(rows,window))
        self.assertFalse(overlaps(window['start'],window['start'],window))
        self.assertFalse(overlaps(window['end'],window['start'],window))
        self.assertFalse(overlaps('2026-11-17T05:00:00Z','2026-11-17T06:00:00Z',window))
        request['history']=[dict(role='user',content='Sunday weather'),dict(role='assistant',content='Tuesday weather')]
        request['question']='What about tomorrow?'
        self.assertEqual(request_windows(request)['windows'][0]['start'],'2026-11-15T05:00:00Z')
        request['question']='Weather from 2026-11-14T12:00 to 2026-11-15T12:00'
        self.assertEqual(request_windows(request),dict(requested=True,windows=[]))


if __name__=='__main__':
    if '--projections' in sys.argv:print(json.dumps(projections()))
    else:unittest.main()
