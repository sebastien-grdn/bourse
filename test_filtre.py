import json
import unittest
from datetime import datetime, timedelta, timezone
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

import app
from market import evaluate, latest_session


def analyze(prices):
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    dates = [start + timedelta(days=i) for i in range(len(prices))]
    chart = {"meta": {"currency": "EUR"}, "timestamp": [d.timestamp() for d in dates],
             "indicators": {"quote": [{"close": prices}]}}
    sessions = [d.date().isoformat() for d in dates]
    return evaluate(chart, sessions, sessions[-1])


class FilterTests(unittest.TestCase):
    def test_recent_and_exact(self):
        row = dict(analyze([10]*120 + [12]*3), ticker="TEST.PA", name="Exemple")
        for key in ("mm50", "mm100"):
            self.assertFalse(row[key]["crossed"])
            self.assertEqual(row[key]["event"]["age"], 3)
        with TemporaryDirectory() as folder, patch.object(app, "CACHE", Path(folder)/"scan.json"):
            app.CACHE.write_text(json.dumps({"date": row["date"], "rows": [row]}))
            client = app.app.test_client()
            for mode, days, visible in [("recent", 2, False), ("exact", 3, True),
                                        ("exact", 4, False), ("recent", 4, True)]:
                response = client.get(f"/?mode={mode}&seances={days}&filtre=mm50")
                self.assertEqual(response.status_code, 200)
                self.assertEqual("TEST.PA" in response.get_data(as_text=True), visible)

    def test_interrupted_then_recrossed(self):
        self.assertIsNone(analyze([10]*120 + [13, 13, 9])["mm50"]["event"])
        signal = analyze([10]*120 + [13, 13, 9, 14])["mm50"]
        self.assertTrue(signal["crossed"])
        self.assertEqual(signal["event"]["age"], 1)

    def test_independent_averages(self):
        row = analyze([20]*100 + [10]*60 + [11])
        self.assertTrue(row["mm50"]["crossed"])
        self.assertIsNone(row["mm100"]["event"])

    def test_incomplete_history(self):
        with self.assertRaises(ValueError):
            analyze([10]*99 + [None, 12])
        self.assertEqual(analyze(list(range(10, 111)))["mm100"]["coverage"], 1)

    def test_incomplete_session(self):
        self.assertEqual(latest_session(datetime(2026, 11, 20, 12, tzinfo=timezone.utc)), "2026-11-19")


if __name__ == "__main__":
    unittest.main()
