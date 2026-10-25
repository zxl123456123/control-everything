"""Validated news schedules and pure UTC deadline calculation."""
from datetime import datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

TOPICS = {'coding', 'agents', 'claude', 'models', 'tibo'}


def validate_schedule(value):
    if not isinstance(value, dict) or set(value) != {'enabled', 'mode', 'interval_minutes', 'times', 'timezone', 'browser'}:
        raise ValueError('schedule.fields')
    if type(value['enabled']) is not bool or value['mode'] not in ('interval', 'daily'):
        raise ValueError('schedule.mode')
    zone = value['timezone']
    if not isinstance(zone, str) or not 1 <= len(zone) <= 64:
        raise ValueError('schedule.timezone')
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError('schedule.timezone') from None
    interval, times = value['interval_minutes'], value['times']
    if interval is not None and (type(interval) is not int or not 15 <= interval <= 10080):
        raise ValueError('schedule.interval_minutes')
    if (not isinstance(times, list) or len(times) > 8 or any(not isinstance(t, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', t) for t in times)
            or len(set(times)) != len(times)):
        raise ValueError('schedule.times')
    if value['enabled'] and (value['mode'] == 'interval' and interval is None or value['mode'] == 'daily' and not times):
        raise ValueError('schedule.time_required')
    browser = value['browser']
    if (not isinstance(browser, dict) or set(browser) != {'enabled', 'topic', 'query'}
            or type(browser['enabled']) is not bool or not isinstance(browser['query'], str) or len(browser['query']) > 240
            or browser['topic'] is not None and (not isinstance(browser['topic'], str) or browser['topic'] not in TOPICS)):
        raise ValueError('schedule.browser')
    if browser['enabled'] and (browser['topic'] not in TOPICS or not browser['query'].strip()):
        raise ValueError('schedule.browser_required')
    return {**value, 'times': sorted(times), 'browser': {**browser, 'query': browser['query'].strip()}}


def next_due(schedule, now, *, anchor=None):
    """Return a strictly future aware UTC time; skip DST gaps and second folds."""
    if now.tzinfo is None or anchor is not None and anchor.tzinfo is None:
        raise ValueError('aware_time_required')
    now = now.astimezone(timezone.utc)
    if not schedule['enabled']:
        return None
    if schedule['mode'] == 'interval':
        step = timedelta(minutes=schedule['interval_minutes'])
        anchor = (anchor or now).astimezone(timezone.utc)
        return anchor + step * max(1, (now - anchor) // step + 1)
    zone = ZoneInfo(schedule['timezone'])
    day = now.astimezone(zone).date()
    for offset in range(370):
        candidates = []
        for text in schedule['times']:
            local = datetime.combine(day + timedelta(days=offset), datetime.strptime(text, '%H:%M').time()).replace(tzinfo=zone, fold=0)
            utc = local.astimezone(timezone.utc)
            if utc > now and utc.astimezone(zone).replace(tzinfo=None) == local.replace(tzinfo=None):
                candidates.append(utc)
        if candidates:
            return min(candidates)
    raise ValueError('schedule.no_future_time')
