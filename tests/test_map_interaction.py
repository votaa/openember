import importlib.util
import html
import json
import re
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
    @staticmethod
    def streamlit_folium_inner_text(popup_html):
        """Approximate the popup innerText returned by Streamlit-Folium."""
        return html.unescape(re.sub(r"<[^>]+>", "", popup_html))

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
        feature = MODULE.map_feature_from_popup(
            self.streamlit_folium_inner_text(popup)
        )
        self.assertEqual(feature["title"], "Far Rockaway")
        self.assertEqual(feature["source_name"], "LIRR branches")
        self.assertEqual(feature["geometry_type"], "LineString")
        self.assertEqual(feature["description"], "")

    def test_clickable_point_line_and_polygon_metadata_survives_inner_text(self):
        cases = [
            {
                "title": "KHWV — Brookhaven Airport",
                "source": "Wind Observations",
                "geometry": "Point",
                "description": "Wind: 9mph from 150° · Temp: 73°F · Clear",
            },
            {
                "title": "Kings Point",
                "source": "Live Tidal Gauges (CO-OPS)",
                "geometry": "Point",
                "description": "Water level: 7.84ft MLLW · MODERATE FLOOD",
            },
            {
                "title": "Port Jefferson",
                "source": "LIRR_Lines",
                "geometry": "MultiLineString",
                "description": "",
            },
            {
                "title": "FEMA Zone AE",
                "source": "Flood Risk Areas",
                "geometry": "MultiPolygon",
                "description": "1% annual-chance flood hazard",
            },
        ]

        for case in cases:
            with self.subTest(case["title"]):
                popup = MODULE.map_feature_popup_html(
                    f'<div><b>{case["title"]}</b></div>',
                    case["title"],
                    case["source"],
                    case["geometry"],
                    case["description"],
                )
                inner_text = self.streamlit_folium_inner_text(popup)
                feature = MODULE.map_feature_from_popup(inner_text)
                self.assertEqual(feature["title"], case["title"])
                self.assertEqual(feature["source_name"], case["source"])
                self.assertEqual(feature["geometry_type"], case["geometry"])
                self.assertEqual(feature["description"], case["description"])
                self.assertNotIn("Map feature", MODULE.map_feature_chat_prompt(feature))

    def test_streamlit_map_event_payload_returns_normalized_feature(self):
        popup = MODULE.map_feature_popup_html(
            "<b>Port Jefferson</b>",
            "Port Jefferson",
            "LIRR_Lines",
            "LineString",
        )
        map_data = {
            "last_object_clicked_popup": self.streamlit_folium_inner_text(popup),
            "last_object_clicked": {"lat": 40.9, "lng": -73.1},
            "last_object_clicked_count": 2,
        }
        feature = MODULE.map_feature_from_map_data(map_data)
        self.assertEqual(feature["title"], "Port Jefferson")
        self.assertIsNone(MODULE.map_feature_from_map_data({}))

    def test_geojson_line_and_polygon_can_select_from_tooltip_event(self):
        for title, source, geometry in (
            ("Port Jefferson", "LIRR branches", "MultiLineString"),
            ("FEMA Zone AE", "Flood Risk Areas", "MultiPolygon"),
        ):
            with self.subTest(geometry):
                tooltip = MODULE.map_feature_tooltip_html(
                    title,
                    title,
                    source,
                    geometry,
                )
                map_data = {
                    "last_object_clicked_popup": None,
                    "last_object_clicked_tooltip": self.streamlit_folium_inner_text(tooltip),
                    "last_object_clicked": {"lat": 40.8, "lng": -73.1},
                    "last_object_clicked_count": 1,
                }
                feature = MODULE.map_feature_from_map_data(map_data)
                self.assertEqual(feature["title"], title)
                self.assertEqual(feature["source_name"], source)
                self.assertEqual(feature["geometry_type"], geometry)

    def test_component_contract_for_repeat_clicks_and_dismissal(self):
        self.assertEqual(
            MODULE.MAP_RETURNED_OBJECTS,
            (
                "last_object_clicked_popup",
                "last_object_clicked_tooltip",
                "last_object_clicked",
                "last_object_clicked_count",
            ),
        )
        state = {
            "selected_map_feature": {"title": "Port Jefferson"},
            "map_interaction_revision": 4,
        }
        MODULE.reset_map_feature_selection(state)
        self.assertIsNone(state["selected_map_feature"])
        self.assertEqual(state["map_interaction_revision"], 5)
        self.assertEqual(MODULE.map_component_key(5), "operational_map_5")

    def test_geojson_vectors_are_normalized_for_direct_leaflet_layers(self):
        line_parts = MODULE.leaflet_geometry_parts({
            "type": "MultiLineString",
            "coordinates": [
                [[-73.1, 40.8], [-73.0, 40.9]],
                [[-72.9, 40.7], [-72.8, 40.8]],
            ],
        })
        self.assertEqual(len(line_parts), 2)
        self.assertEqual(line_parts[0]["kind"], "line")
        self.assertEqual(line_parts[0]["locations"][0], [40.8, -73.1])

        polygon_parts = MODULE.leaflet_geometry_parts({
            "type": "MultiPolygon",
            "coordinates": [
                [[[-73.1, 40.8], [-73.0, 40.8], [-73.0, 40.9], [-73.1, 40.8]]],
                [[[-72.9, 40.7], [-72.8, 40.7], [-72.8, 40.8], [-72.9, 40.7]]],
            ],
        })
        self.assertEqual(len(polygon_parts), 2)
        self.assertTrue(all(part["kind"] == "polygon" for part in polygon_parts))
        self.assertEqual(polygon_parts[0]["locations"][0][0], [40.8, -73.1])

    def test_chat_prompt_is_explicit_action_text(self):
        self.assertEqual(
            MODULE.map_feature_chat_prompt({
                "title": "Port Jefferson",
                "source_name": "LIRR branches",
                "geometry_type": "LineString",
            }),
            "Tell me about emergency considerations for Port Jefferson — ",
        )

    def test_montauk_prompt_matches_react_contract(self):
        self.assertEqual(
            MODULE.map_feature_chat_prompt({
                "title": "Montauk (peninsula tip)",
                "description": (
                    "Zone VE — 3-sided water exposure; single road in/out "
                    "(Route 27)"
                ),
                "source_name": "Flood Risk Areas",
                "geometry_type": "Point",
            }),
            "Tell me about emergency considerations for Montauk (peninsula tip) — "
            "Zone VE — 3-sided water exposure; single road in/out (Route 27)",
        )


if __name__ == "__main__":
    unittest.main()
