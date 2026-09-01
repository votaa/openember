import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "streamlit"))

from phase4_sources import PHASE4_SOURCE_IDS, fetch_phase4_source_bundle, phase4_source_card, unavailable_phase4_result


class Phase4SourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config = json.loads((ROOT / "config" / "jurisdiction.generated.json").read_text())
        cls.sources = {source["id"]: source for source in config["source_registry"]}
        cls.fixture = json.loads((ROOT / "fixtures" / "long-island-sources" / "phase-4-display.json").read_text())

    def test_cards_expose_state_counts_and_map_capability(self):
        cards = {
            source_id: phase4_source_card(self.sources[source_id], result)
            for source_id, result in self.fixture["results"].items()
        }
        self.assertTrue(cards["nyc_311_rockaway"]["map_capable"])
        self.assertEqual(cards["nyc_cooling_centers_rockaway"]["data_state"], "unavailable")
        self.assertEqual(cards["nys_dec_active_sites"]["record_count"], 2)
        self.assertEqual(cards["nys_dec_active_sites"]["rejected_count"], 1)
        self.assertEqual(cards["nys_civil_boundaries"]["map_count"], 1)

    def test_every_phase4_source_has_an_explicit_initial_state(self):
        self.assertNotIn("nypd_incidents_rockaway", PHASE4_SOURCE_IDS)
        for source_id in PHASE4_SOURCE_IDS:
            source = self.sources[source_id]
            result = unavailable_phase4_result(source)
            self.assertIn(result["data_state"], {"unavailable", "stale"})
            self.assertIsNotNone(result["reason"])

    def test_successful_socrata_result_is_cached_for_refresh_period(self):
        source = self.sources["nyc_311_rockaway"]
        rows = json.loads(
            (ROOT / "fixtures" / "long-island-sources" / "phase-3-rockaway-normalization.json").read_text()
        )["cases"][0]["rows"]
        calls = []
        cache = {}

        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return rows

        def request_get(_url, **kwargs):
            calls.append(kwargs)
            return Response()

        fetch_phase4_source_bundle(
            [source], request_get, fetched_at="2026-08-30T14:00:00.000Z", cache=cache, now_seconds=1,
        )
        fetch_phase4_source_bundle(
            [source], request_get, fetched_at="2026-08-30T14:01:00.000Z", cache=cache, now_seconds=61,
        )

        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
