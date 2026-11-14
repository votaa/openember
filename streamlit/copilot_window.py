"""Calendar windows independent of feed labels, fetch time and point coverage."""
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
TOKEN=re.compile(r'\b(?:\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?\s+to\s+\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?|\d{4}-\d{2}-\d{2}(?:\s+to\s+\d{4}-\d{2}-\d{2})?|tomorrow night|tonight|today|tomorrow|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: night)?)\b',re.I)


def instant(stamp):
    if not isinstance(stamp,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})',stamp,re.I):
        raise ValueError('An offset-bearing timestamp is required')
    return datetime.fromisoformat(stamp.upper().replace('Z','+00:00'))


def local_date(stamp,zone):
    return instant(stamp).astimezone(ZoneInfo(zone)).date().isoformat()


def resolve_window(period,requested_at,zone):
    try:
        period=period.lower().strip();parts=re.split(r'\s+to\s+',period)
        def utc(value):return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z').replace('.000Z','Z')
        if len(parts)==2 and 't' in parts[0]:
            start,end=map(instant,parts)
            return dict(start=utc(start),end=utc(end),timezone=zone) if start<end else None
        date=datetime.fromisoformat(local_date(requested_at,zone)).date();end_date=None
        night=period=='tonight' or period.endswith(' night');name=re.sub(' night$','',period)
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}',parts[0]):
            date=datetime.fromisoformat(parts[0]).date();end_date=datetime.fromisoformat(parts[-1]).date()
            if end_date<date:return None
        elif name=='tomorrow':date+=timedelta(days=1)
        elif name in WEEKDAYS:date+=timedelta(days=(WEEKDAYS.index(name)-(date.weekday()+1)%7)%7)
        elif name not in ('today','tonight'):return None
        def civil(day,hour):return datetime(day.year,day.month,day.day,hour,tzinfo=ZoneInfo(zone))
        return dict(start=utc(civil(date,18 if night else 0)),end=utc(civil((end_date or date)+timedelta(days=1),6 if night else 0)),timezone=zone)
    except (ValueError,TypeError,KeyError):return None


def request_windows(request):
    names=TOKEN.findall(request['question'])
    if not names and re.match(r'what about\b',request['question'],re.I):
        users=[m for m in request['history'] if m['role']=='user']
        names=TOKEN.findall(users[-1]['content']) if users else []
    return dict(requested=bool(names),windows=[w for name in names if (w:=resolve_window(name,request['requested_at'],request['jurisdiction']['timezone']))])


def overlaps(start,end,window):
    try:return instant(start)<instant(end) and instant(start)<instant(window['end']) and instant(end)>instant(window['start'])
    except (ValueError,TypeError):return False


def covers_window(periods,window):
    cursor=instant(window['start'])
    rows=[]
    for p in periods:
        try:rows.append((instant(p['startTime']),instant(p['endTime'])))
        except (ValueError,TypeError,KeyError):continue
    for start,end in sorted(rows):
        if end<=cursor:continue
        if start>cursor:return False
        cursor=max(cursor,end)
        if cursor>=instant(window['end']):return True
    return False
