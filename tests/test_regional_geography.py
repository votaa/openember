import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "streamlit" / "regional_geography.py"
SPEC = importlib.util.spec_from_file_location("regional_geography", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

FIXTURE = json.loads((ROOT / "fixtures" / "long-island-sources" / "phase-3-regional-geography.json").read_text())
SOURCES = MODULE.load_sources()


def normalized_output():
    return {
        case["source_id"]: MODULE.normalize_geography_payload(
            SOURCES[case["source_id"]], case["payload"], FIXTURE["fetched_at"], FIXTURE["evaluated_at"]
        )
        for case in FIXTURE["cases"]
    }


class RegionalGeographyTests(unittest.TestCase):
    def test_query_contracts(self):
        cb14_url = MODULE.build_geography_query_url(SOURCES["nyc_cb14_boundary"])
        self.assertIn("BoroCD+%3D+414", cb14_url)
        self.assertIn("outSR=4326", cb14_url)
        utility_url = MODULE.build_geography_query_url(SOURCES["nys_electric_utility_territories"])
        self.assertIn("%24where=", utility_url)
        self.assertIn("FREEPORT", utility_url)

    def test_operational_and_pseg_modes(self):
        records = [record for result in normalized_output().values() for record in result["records"]]
        features = [
            {"type": "Feature", "properties": {"name": "Nassau PSEG"}, "geometry": {"type": "Point", "coordinates": [5, 5]}},
            {"type": "Feature", "properties": {"name": "Freeport municipal"}, "geometry": {"type": "Point", "coordinates": [1.5, 1.5]}},
            {"type": "Feature", "properties": {"name": "Rockaway"}, "geometry": {"type": "Point", "coordinates": [-1, 1]}},
            {"type": "Feature", "properties": {"name": "Outside"}, "geometry": {"type": "Point", "coordinates": [25, 5]}},
        ]
        operational = MODULE.filter_features_by_mode(features, records, "operational")
        pseg = MODULE.filter_features_by_mode(features, records, "pseg_long_island")
        self.assertEqual([feature["properties"]["name"] for feature in operational], ["Nassau PSEG", "Freeport municipal", "Rockaway"])
        self.assertEqual([feature["properties"]["name"] for feature in pseg], ["Nassau PSEG", "Rockaway"])

    def test_geometry_holes_and_intersection(self):
        pseg = next(record["geometry"] for result in normalized_output().values() for record in result["records"] if record["scope_key"] == "pseg_long_island")
        self.assertTrue(MODULE.point_in_polygon([5, 5], pseg))
        self.assertFalse(MODULE.point_in_polygon([1.5, 1.5], pseg))
        self.assertTrue(MODULE.geometry_intersects_mask({"type": "LineString", "coordinates": [[-5, 1], [1, 1]]}, pseg))

    def test_missing_expected_scope_is_partial(self):
        case = next(item for item in FIXTURE["cases"] if item["source_id"] == "nys_civil_boundaries")
        payload = json.loads(json.dumps(case["payload"]))
        payload["features"].pop()
        result = MODULE.normalize_geography_payload(SOURCES[case["source_id"]], payload, FIXTURE["fetched_at"])
        self.assertEqual(result["data_state"], "partial")
        self.assertEqual(result["missing_scope_keys"], ["queens"])


if __name__ == "__main__":
    unittest.main()
