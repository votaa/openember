import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "map_builder_presets", ROOT / "streamlit" / "map_builder_presets.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MapBuilderPresetTests(unittest.TestCase):
    def test_presets_have_unique_direct_service_urls(self):
        presets = MODULE.LIVING_ATLAS_PRESETS
        urls = [preset["url"] for preset in presets]
        self.assertEqual(len(presets), 6)
        self.assertEqual(len(urls), len(set(urls)))
        for preset in presets:
            self.assertTrue(preset["url"].startswith("https://"))
            self.assertIn(preset["type"], {"Feature Layer", "Map Service"})
            if preset["type"] == "Feature Layer":
                self.assertRegex(preset["url"], r"/FeatureServer/\d+$")
            else:
                self.assertTrue(preset["url"].endswith("/MapServer"))

    def test_retired_p3e_endpoints_are_not_presets(self):
        retired_names = {
            "Historical_Hurricane_Tracks", "USA_Hospitals",
            "USA_Fire_Stations", "FEMA_Disaster_Declaration_Areas",
        }
        for preset in MODULE.LIVING_ATLAS_PRESETS:
            self.assertFalse(any(name in preset["url"] for name in retired_names))


if __name__ == "__main__":
    unittest.main()
