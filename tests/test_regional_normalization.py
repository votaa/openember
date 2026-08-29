import json
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "streamlit" / "regional_normalization.py"
SPEC = importlib.util.spec_from_file_location("regional_normalization", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
load_sources = MODULE.load_sources
normalize_rockaway_payload = MODULE.normalize_rockaway_payload
build_rockaway_query_url = MODULE.build_rockaway_query_url
rockaway_source_card = MODULE.rockaway_source_card
unavailable_rockaway_result = MODULE.unavailable_rockaway_result

FIXTURE = json.loads(
    (ROOT / "fixtures" / "long-island-sources" / "phase-3-rockaway-normalization.json").read_text()
)
SOURCES = load_sources()


class RegionalNormalizationTests(unittest.TestCase):
    def test_valid_311_record_is_current_and_mappable(self):
        case = FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], [case["rows"][0]], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "current")
        self.assertEqual(result["records"][0]["geometry"]["type"], "Point")
        self.assertEqual(result["records"][0]["properties"]["community_board"], "14 QUEENS")

    def test_missing_311_coordinates_are_rejected(self):
        row = dict(FIXTURE["cases"][0]["rows"][0])
        row.pop("latitude")
        result = normalize_rockaway_payload(
            SOURCES["nyc_311_rockaway"], [row], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["rejected_count"], 1)

    def test_phase_4_card_and_query_contract(self):
        source = SOURCES["nyc_311_rockaway"]
        case = FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            source, [case["rows"][0]], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        card = rockaway_source_card(source, result)
        self.assertTrue(card["map_capable"])
        self.assertEqual(card["geography"], "Rockaway / Queens CB14")
        query_url = build_rockaway_query_url(source)
        self.assertIn("%24where=", query_url)
        self.assertIn("%24limit=500", query_url)

        gated = SOURCES["nypd_incidents_rockaway"]
        gated_card = rockaway_source_card(gated, unavailable_rockaway_result(gated))
        self.assertFalse(gated_card["map_capable"])
        self.assertIn("point-in-polygon", gated_card["note"])


if __name__ == "__main__":
    unittest.main()
