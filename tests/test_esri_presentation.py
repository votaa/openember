import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "esri_presentation", ROOT / "streamlit" / "esri_presentation.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class EsriPresentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture_path = ROOT / "fixtures" / "esri" / "lirr-branches.json"
        cls.fixture = json.loads(fixture_path.read_text())

    def fake_get(self, url, **_kwargs):
        payload = self.fixture["layer"] if url.rstrip("/").endswith("/4") else self.fixture["service"]
        return FakeResponse(payload)

    def test_discovers_nonzero_sublayer_and_fetches_direct_metadata(self):
        root = "https://example.test/LIRR_branches/FeatureServer"
        discovery = MODULE.discover_feature_layers(root, self.fake_get)
        self.assertIsNone(discovery["error"])
        self.assertEqual(discovery["layers"][0]["url"], root + "/4")

        direct = MODULE.discover_feature_layers(root + "/4", self.fake_get)
        self.assertEqual(direct["layers"][0]["metadata"]["name"], "LIRR branches")

    def test_discovery_preserves_all_selectable_sublayers(self):
        root = "https://example.test/multi/FeatureServer"

        def multi_get(_url, **_kwargs):
            return FakeResponse({"layers": [
                {"id": 2, "name": "Lines", "type": "Feature Layer"},
                {"id": 7, "name": "Stations", "type": "Feature Layer"},
            ]})

        discovery = MODULE.discover_feature_layers(root, multi_get)
        self.assertEqual([layer["id"] for layer in discovery["layers"]], [2, 7])
        self.assertEqual(
            [layer["url"] for layer in discovery["layers"]], [root + "/2", root + "/7"]
        )

    def test_lirr_renderer_field_becomes_human_readable_label(self):
        presentation = MODULE.build_presentation(
            self.fixture["layer"], self.fixture["features"]
        )
        self.assertEqual(presentation["label_field"], "route_long")
        self.assertEqual(presentation["aliases"]["route_long"], "Rail Line Name")
        self.assertEqual(
            MODULE.feature_label(self.fixture["features"][0], presentation, "LIRR branches"),
            "Far Rockaway",
        )

    def test_popup_uses_aliases_domains_expansion_and_escapes_values(self):
        metadata = dict(self.fixture["layer"])
        metadata["fields"] = list(metadata["fields"]) + [
            {"name": f"extra_{index}", "alias": f"Extra {index}", "type": "esriFieldTypeString"}
            for index in range(8)
        ]
        feature = json.loads(json.dumps(self.fixture["features"][0]))
        feature["props"].update({f"extra_{index}": f"value {index}" for index in range(8)})
        feature["props"]["notes"] = "<script>alert(1)</script>"
        presentation = MODULE.build_presentation(metadata, [feature])
        popup = MODULE.feature_popup_html(feature, presentation, "LIRR branches", "#abc")
        self.assertIn("Rail Line Name", popup)
        self.assertIn("Active", popup)
        self.assertIn("more attribute(s)", popup)
        self.assertIn("&lt;script&gt;", popup)
        self.assertNotIn("<script>", popup)
        self.assertNotIn("OBJECTID:", popup)
        self.assertNotIn("Shape Length", popup)

    def test_override_and_metadata_fallback(self):
        override = MODULE.build_presentation(
            self.fixture["layer"], self.fixture["features"], "route_id"
        )
        self.assertEqual(
            MODULE.feature_label(self.fixture["features"][0], override, "LIRR branches"), "11"
        )

        inferred = MODULE.build_presentation(None, [{"props": {"name": "Arverne", "OBJECTID": 2}}])
        self.assertEqual(inferred["metadata_state"], "inferred")
        self.assertEqual(inferred["label_field"], "name")


if __name__ == "__main__":
    unittest.main()
