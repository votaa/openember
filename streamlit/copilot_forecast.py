"""Calendar-aware selection without modifying forecast values or offsets."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def forecast_periods(periods,scope,requested_at):
    if scope['period']=='first period': return periods[:1]
    exact=[p for p in periods if p.get('name','').lower()==scope['period']]
    if exact and scope['period'] not in ('today','tonight','tomorrow','tomorrow night'): return exact
    def instant(stamp): return datetime.fromisoformat(stamp.replace('Z','+00:00').replace('z','+00:00'))
    interval=(scope['period'] or '').split(' to ')
    if len(interval)==2:
        try:
            start,end=map(instant,interval)
            if start>=end: return []
            rows=sorted([p for p in periods if instant(p['startTime'])<end and instant(p['endTime'])>start],key=lambda p:instant(p['startTime']))
            if not rows or instant(rows[0]['startTime'])>start or instant(rows[-1]['endTime'])<end or any(instant(p['startTime'])!=instant(rows[i-1]['endTime']) for i,p in enumerate(rows) if i): return []
            return rows
        except (ValueError,TypeError,KeyError): return []
    if scope['period'] not in ('today','tonight','tomorrow','tomorrow night'): return []
    tz=ZoneInfo(scope['timezone'])
    wanted=instant(requested_at).astimezone(tz).date()
    if scope['period'].startswith('tomorrow'): wanted+=timedelta(days=1)
    dated_exact=[p for p in exact if instant(p['startTime']).astimezone(tz).date()==wanted]
    if dated_exact: return dated_exact
    night='night' in scope['period'] or 'low' in scope['fields']
    return [p for p in periods if instant(p['startTime']).astimezone(tz).date()==wanted and p.get('isDaytime') is (not night)]
