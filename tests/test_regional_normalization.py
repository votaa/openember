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
SPATIAL_FIXTURE = json.loads(
    (ROOT / "fixtures" / "long-island-sources" / "phase-3-rockaway-spatial-qualification.json").read_text()
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

        qualified = SOURCES["nypd_incidents_rockaway"]
        qualified_card = rockaway_source_card(qualified, unavailable_rockaway_result(qualified))
        self.assertFalse(qualified_card["map_capable"])
        self.assertIn("Phase 4", qualified_card["note"])

        evacuation = SOURCES["nyc_hurricane_evacuation_centers_rockaway"]
        evacuation_card = rockaway_source_card(evacuation, unavailable_rockaway_result(evacuation))
        self.assertEqual(evacuation_card["activation_state"], "confirmation_required")
        self.assertEqual(evacuation_card["confirmation_phone"], "311")

    def test_spatial_point_and_polygon_qualification(self):
        output = {
            case["source_id"]: normalize_rockaway_payload(
                SOURCES[case["source_id"]], case.get("rows", case.get("payload")),
                SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"],
                SPATIAL_FIXTURE["geography_records"],
            )
            for case in SPATIAL_FIXTURE["cases"]
        }
        self.assertEqual([record["properties"]["source_record_id"] for record in output["nypd_incidents_rockaway"]["records"]], ["spatial-nypd-in"])
        self.assertEqual([record["title"] for record in output["nycha_developments_rockaway"]["records"]], ["HAMMEL"])
        self.assertEqual(output["nycha_developments_rockaway"]["records"][0]["observed_at"], "2026-05-15T15:07:23.000Z")

        evacuation = output["nyc_hurricane_evacuation_centers_rockaway"]
        self.assertEqual([record["title"] for record in evacuation["records"]], ["IN-SCOPE EVACUATION CENTER FIXTURE"])
        self.assertEqual(evacuation["records"][0]["activation_state"], "confirmation_required")

    def test_evacuation_empty_scope_is_not_zero_active_centers(self):
        case = next(item for item in SPATIAL_FIXTURE["cases"] if item["source_id"] == "nyc_hurricane_evacuation_centers_rockaway")
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], [case["rows"][1]], SPATIAL_FIXTURE["fetched_at"],
            SPATIAL_FIXTURE["evaluated_at"], SPATIAL_FIXTURE["geography_records"],
        )
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["reason"], "no_local_reference_facilities")
        self.assertEqual(result["scope_state"], "no_local_reference_facilities")
        self.assertEqual(result["activation_state"], "confirmation_required")

    def test_malformed_evacuation_rows_fail_closed(self):
        result = normalize_rockaway_payload(
            SOURCES["nyc_hurricane_evacuation_centers_rockaway"],
            [{"bldg_name": "Missing geometry and identifier"}],
            SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"],
            SPATIAL_FIXTURE["geography_records"],
        )
        self.assertEqual(result["data_state"], "unavailable")
        self.assertEqual(result["reason"], "malformed_records")
        self.assertIsNone(result["scope_state"])

    def test_spatial_qualification_requires_cb14_mask(self):
        case = SPATIAL_FIXTURE["cases"][0]
        result = normalize_rockaway_payload(
            SOURCES[case["source_id"]], case["rows"], SPATIAL_FIXTURE["fetched_at"], SPATIAL_FIXTURE["evaluated_at"]
        )
        self.assertEqual(result["data_state"], "unavailable")
        self.assertEqual(result["reason"], "missing_spatial_mask")


if __name__ == "__main__":
    unittest.main()
