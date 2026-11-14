"""Calendar-aware selection without modifying forecast values or offsets."""
from copilot_window import instant, local_date, resolve_window, request_windows, overlaps


def forecast_periods(periods,scope,requested_at):
    if scope['period']=='first period': return periods[:1]
    interval=(scope['period'] or '').split(' to ')
    if len(interval)==2:
        try:
            start,end=map(instant,interval)
            if start>=end: return []
            rows=sorted([p for p in periods if instant(p['startTime'])<end and instant(p['endTime'])>start],key=lambda p:instant(p['startTime']))
            if not rows or instant(rows[0]['startTime'])>start or instant(rows[-1]['endTime'])<end or any(instant(p['startTime'])!=instant(rows[i-1]['endTime']) for i,p in enumerate(rows) if i): return []
            return rows
        except (ValueError,TypeError,KeyError): return []
    window=resolve_window(scope['period'],requested_at,scope['timezone'])
    if not window:return []
    wanted=local_date(window['start'],scope['timezone'])
    night='night' in scope['period'] or 'low' in scope['fields']
    def selected(p):
        try:return local_date(p['startTime'],scope['timezone'])==wanted and p.get('isDaytime') is (not night)
        except (ValueError,TypeError,KeyError):return False
    return [p for p in periods if selected(p)]


def context_forecast_periods(request,periods):
    scope=request_windows(request)
    return [p for p in periods if any(overlaps(p.get('startTime'),p.get('endTime'),w) for w in scope['windows'])] if scope['requested'] else periods
