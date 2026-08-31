import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "streamlit" / "map_interaction.py"
SPEC = importlib.util.spec_from_file_location("map_interaction", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

ESRI_MODULE_PATH = ROOT / "streamlit" / "esri_presentation.py"
ESRI_SPEC = importlib.util.spec_from_file_location("esri_presentation", ESRI_MODULE_PATH)
ESRI_MODULE = importlib.util.module_from_spec(ESRI_SPEC)
assert ESRI_SPEC and ESRI_SPEC.loader
ESRI_SPEC.loader.exec_module(ESRI_MODULE)


class MapInteractionTests(unittest.TestCase):
    def test_real_lirr_popup_metadata_is_normalized(self):
        fixture = json.loads((ROOT / "fixtures" / "esri" / "lirr-branches.json").read_text())
        presentation = ESRI_MODULE.build_presentation(fixture["layer"], fixture["features"])
        raw_feature = fixture["features"][0]
        label = ESRI_MODULE.feature_label(raw_feature, presentation, "LIRR branches")
        popup = MODULE.map_feature_popup_html(
            ESRI_MODULE.feature_popup_html(
                raw_feature, presentation, "LIRR branches", "#abc"
            ),
            label,
            "LIRR branches",
            raw_feature["geometry"]["type"],
        )
        self.assertNotIn("<b", popup)
        feature = MODULE.map_feature_from_popup(popup)
        self.assertEqual(feature["title"], "Far Rockaway")
        self.assertEqual(feature["source_name"], "LIRR branches")
        self.assertEqual(feature["geometry_type"], "LineString")
        self.assertEqual(feature["description"], "")

    def test_chat_prompt_is_explicit_action_text(self):
        self.assertEqual(
            MODULE.map_feature_chat_prompt({
                "title": "Port Jefferson",
                "source_name": "LIRR branches",
                "geometry_type": "LineString",
            }),
            "Emergency considerations and risk profile for: Port Jefferson\n"
            "Source layer: LIRR branches\n"
            "Feature type: LineString",
        )


if __name__ == "__main__":
    unittest.main()
