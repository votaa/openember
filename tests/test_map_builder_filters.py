import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "streamlit"))

from map_builder_filters import (  # noqa: E402
    FILTER_MODES,
    OPERATIONAL,
    PSEG_LONG_ISLAND,
    UNFILTERED,
    evaluate_map_builder_filter,
)


class MapBuilderFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "fixtures" / "long-island-sources" / "map-builder-filter-parity.json").read_text())

    def layer(self, mode=UNFILTERED, source_type="Feature Layer"):
        return {
            "type": source_type,
            "source_type": source_type,
            "url": "https://example.test/FeatureServer/0" if source_type == "Feature Layer" else "https://example.test/MapServer",
            "filter_mode": mode,
            "features": self.fixture["features"],
        }

    def test_all_entry_paths_match_expected_counts(self):
        for mode in FILTER_MODES:
            result = evaluate_map_builder_filter(self.layer(mode), self.fixture["geography_records"])
            self.assertEqual([feature["id"] for feature in result["features"]], self.fixture["expected"][mode])

    def test_operational_preserves_municipal_assets(self):
        result = evaluate_map_builder_filter(self.layer(OPERATIONAL), self.fixture["geography_records"])
        self.assertIn("municipal_freeport", [feature["id"] for feature in result["features"]])

    def test_pseg_excludes_municipal_assets(self):
        result = evaluate_map_builder_filter(self.layer(PSEG_LONG_ISLAND), self.fixture["geography_records"])
        self.assertNotIn("municipal_freeport", [feature["id"] for feature in result["features"]])

    def test_unsupported_types_disclose_unfiltered_fallback(self):
        result = evaluate_map_builder_filter(self.layer(OPERATIONAL, "Map Service"), self.fixture["geography_records"])
        self.assertFalse(result["supported"])
        self.assertEqual(result["effective_mode"], UNFILTERED)
        self.assertEqual(result["reason"], "unsupported_layer_type")


if __name__ == "__main__":
    unittest.main()
