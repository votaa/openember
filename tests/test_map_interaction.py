import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "streamlit" / "map_interaction.py"
SPEC = importlib.util.spec_from_file_location("map_interaction", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class MapInteractionTests(unittest.TestCase):
    def test_popup_metadata_is_normalized(self):
        feature = MODULE.map_feature_from_popup(
            '<div data-source-name="LIRR branches" data-geometry-type="LineString">'
            '<b style="color:#abc">LIRR Main Line</b>'
            '<span style="color:#aac">Rail corridor</span></div>'
        )
        self.assertEqual(feature["title"], "LIRR Main Line")
        self.assertEqual(feature["source_name"], "LIRR branches")
        self.assertEqual(feature["geometry_type"], "LineString")

    def test_chat_prompt_is_explicit_action_text(self):
        self.assertEqual(
            MODULE.map_feature_chat_prompt({"title": "LIRR Main Line"}),
            "Emergency considerations and risk profile for: LIRR Main Line",
        )


if __name__ == "__main__":
    unittest.main()
