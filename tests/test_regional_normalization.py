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

    def test_fdny_record_is_scoped_but_not_given_invented_geometry(self):
        case = FIXTURE["cases"][1]
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], [case["rows"][0]], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "current")
        self.assertIsNone(result["records"][0]["geometry"])
        self.assertEqual(result["records"][0]["status"], "closed")

    def test_missing_311_coordinates_are_rejected(self):
        row = dict(FIXTURE["cases"][0]["rows"][0])
        row.pop("latitude")
        result = normalize_rockaway_payload(
            SOURCES["nyc_311_rockaway"], [row], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["rejected_count"], 1)


if __name__ == "__main__":
    unittest.main()
