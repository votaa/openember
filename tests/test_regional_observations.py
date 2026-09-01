import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "streamlit" / "regional_observations.py"
SPEC = importlib.util.spec_from_file_location("regional_observations", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

FIXTURE = json.loads((ROOT / "fixtures" / "long-island-sources" / "phase-3-regional-observations.json").read_text())
SOURCES = MODULE.load_sources()


def normalized_output():
    return {
        case["source_id"]: MODULE.normalize_regional_payload(
            SOURCES[case["source_id"]], case["payload"], FIXTURE["fetched_at"],
            FIXTURE["evaluated_at"], FIXTURE["geography_records"],
        )
        for case in FIXTURE["cases"]
    }


class RegionalObservationTests(unittest.TestCase):
    def test_noaa_and_usgs_latest_observations(self):
        output = normalized_output()
        kings = output["coops_kings_point"]["records"][0]
        self.assertEqual(kings["observed_at"], "2026-08-30T13:54:00.000Z")
        self.assertEqual(kings["properties"]["datum"], "MLLW")
        self.assertEqual(output["usgs_massapequa_creek"]["records"][0]["properties"]["source_record_id"], "massapequa-latest")
        self.assertEqual(output["usgs_rosedale_reference"]["records"][0]["geography"], "reference")

    def test_dec_county_geometry_validation(self):
        result = normalized_output()["nys_dec_active_sites"]
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["rejected_count"], 1)
        self.assertEqual([record["geography"] for record in result["records"]], ["nassau", "suffolk"])
        self.assertEqual(result["records"][0]["properties"]["site_class"], "02")

    def test_bounded_queries(self):
        coops_url = MODULE.build_regional_source_url(SOURCES["coops_kings_point"], FIXTURE["evaluated_at"])
        self.assertIn("range=6", coops_url)
        self.assertIn("datum=MLLW", coops_url)
        usgs_url = MODULE.build_regional_source_url(SOURCES["usgs_massapequa_creek"], FIXTURE["evaluated_at"])
        self.assertIn("monitoring_location_id=USGS-01309500", usgs_url)
        self.assertIn("2026-08-30T02%3A00%3A00.000Z%2F2026-08-30T14%3A00%3A00.000Z", usgs_url)
        dec_url = MODULE.build_regional_source_url(SOURCES["nys_dec_active_sites"], FIXTURE["evaluated_at"])
        self.assertIn("resultRecordCount=1000", dec_url)
        self.assertIn("outSR=4326", dec_url)

    def test_failure_states(self):
        coops_case = next(item for item in FIXTURE["cases"] if item["source_id"] == "coops_kings_point")
        stale = MODULE.normalize_regional_payload(
            SOURCES["coops_kings_point"], coops_case["payload"], FIXTURE["fetched_at"],
            "2026-08-30T14:14:00.001Z", FIXTURE["geography_records"],
        )
        self.assertEqual(stale["data_state"], "stale")
        empty_usgs = MODULE.normalize_regional_payload(
            SOURCES["usgs_massapequa_creek"], {"type": "FeatureCollection", "features": []}, FIXTURE["fetched_at"]
        )
        self.assertEqual(empty_usgs["data_state"], "partial")
        dec_case = next(item for item in FIXTURE["cases"] if item["source_id"] == "nys_dec_active_sites")
        missing_mask = MODULE.normalize_regional_payload(
            SOURCES["nys_dec_active_sites"], dec_case["payload"], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        self.assertEqual(missing_mask["reason"], "missing_spatial_mask")


if __name__ == "__main__":
    unittest.main()
