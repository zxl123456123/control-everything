"""Pure schedule calculations, including DST and interval catch-up."""
from datetime import datetime, timezone
import copy
import unittest
from control_everything.workspace.news_settings import default_settings
from control_everything.workspace.news_schedule import validate_schedule, next_due


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.schedule = default_settings()['schedule']

    def test_defaults_do_not_schedule(self):
        self.assertIsNone(next_due(self.schedule, datetime.now(timezone.utc)))

    def test_interval_advances_once_to_future(self):
        self.schedule.update(enabled=True, interval_minutes=15)
        anchor = datetime.fromisoformat('2026-01-01T00:00:00+00:00')
        self.assertEqual(next_due(self.schedule, anchor.replace(hour=4, minute=2), anchor=anchor).isoformat(), '2026-01-01T04:15:00+00:00')

    def test_validation_requires_user_time(self):
        self.schedule['enabled'] = True
        with self.assertRaises(ValueError):
            validate_schedule(self.schedule)
        for interval in (True, 0, 14, 10081, 1.5):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                validate_schedule({**self.schedule, 'interval_minutes': interval})

    def test_daily_cross_day_and_timezone(self):
        self.schedule.update(enabled=True, mode='daily', times=['09:00', '18:00'])
        self.assertEqual(next_due(self.schedule, datetime.fromisoformat('2026-01-01T10:01:00+00:00')).isoformat(), '2026-01-02T01:00:00+00:00')

    def test_dst_gap_is_skipped_and_fold_only_first(self):
        self.schedule.update(enabled=True, mode='daily', times=['02:30'], timezone='America/New_York')
        self.assertEqual(next_due(self.schedule, datetime.fromisoformat('2026-03-08T05:00:00+00:00')).isoformat(), '2026-03-09T06:30:00+00:00')
        self.schedule['times'] = ['01:30']
        self.assertEqual(next_due(self.schedule, datetime.fromisoformat('2026-11-01T05:31:00+00:00')).isoformat(), '2026-11-02T06:30:00+00:00')

    def test_timezone_and_duplicate_times_rejected(self):
        for change in ({'timezone': 'Unknown/Zone'}, {'times': ['09:00', '09:00']}, {'times': ['24:00']}, {'browser': {'enabled': True, 'topic': None, 'query': ''}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_schedule({**self.schedule, **change})

    def test_unhashable_browser_topic_is_a_validation_error(self):
        self.schedule['browser']['topic'] = []
        with self.assertRaisesRegex(ValueError, 'schedule.browser'):
            validate_schedule(self.schedule)
