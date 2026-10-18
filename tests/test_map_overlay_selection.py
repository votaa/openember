import ast
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "streamlit"))
from map_overlay_selection import overlay_inventory, selection_state, set_overlay, select_overlays, initialize_added_visibility
from carto_tiles import basemap_config


class OverlaySelectionTests(unittest.TestCase):
    def state(self):
        return {"active_phase4_layers":["regional"], "map_layers":[
            {"id":"esri", "visible":False,"features":[{"id":1}],"filter_mode":"operational"}],
            "selected_map_feature":{"title":"old"}}

    def test_all_off_all_overrides_individual_choices_without_deleting(self):
        state = self.state()
        select_overlays(state, ["regional"], False)
        self.assertEqual(selection_state(overlay_inventory(state, ["regional"])), "Off")
        select_overlays(state, ["regional"], True)
        self.assertEqual(selection_state(overlay_inventory(state, ["regional"])), "All")
        self.assertEqual(state["map_layers"][0]["features"], [{"id":1}])
        self.assertEqual(state["map_layers"][0]["filter_mode"], "operational")
        set_overlay(state,"show_tidal",False)
        self.assertEqual(selection_state(overlay_inventory(state, ["regional"])), "Some")
        self.assertIsNone(state["selected_map_feature"])
        set_overlay(state,"show_tidal",True)
        self.assertEqual(selection_state(overlay_inventory(state, ["regional"])), "All")

    def test_add_while_off_and_removal(self):
        state = self.state()
        state["previous_overlay_state"] = "Off"
        initialize_added_visibility(state)
        self.assertFalse(state["map_layers"][0]["visible"])
        select_overlays(state, ["regional"], False)
        state["map_layers"].append({"id":"new", "visible":True})
        initialize_added_visibility(state)
        self.assertFalse(state["map_layers"][1]["visible"])
        set_overlay(state,"user:new",True)
        initialize_added_visibility(state)
        self.assertTrue(state["map_layers"][1]["visible"])
        state["map_layers"] = []
        select_overlays(state, ["regional"], True)
        self.assertEqual(state["map_layers"], [])

    def test_phase4_is_opt_in_and_bulk_keeps_enrollment_after_hiding(self):
        state = {"active_phase4_layers":[], "enrolled_phase4_layers":[], "map_layers":[]}
        ready = ["boundaries", "utilities", "nyc_311_rockaway"]
        self.assertFalse(any(key.startswith("regional:") for key in overlay_inventory(state, ready)))
        select_overlays(state, ready, False)
        select_overlays(state, ready, True)
        self.assertEqual(state["active_phase4_layers"], [])
        self.assertEqual(state["enrolled_phase4_layers"], [])
        set_overlay(state, "regional:utilities", True)
        self.assertEqual(state["enrolled_phase4_layers"], ["utilities"])
        select_overlays(state, ready, False)
        self.assertEqual(state["active_phase4_layers"], [])
        self.assertEqual(selection_state(overlay_inventory(state, ready)), "Off")
        select_overlays(state, ready, True)
        self.assertEqual(state["active_phase4_layers"], ["utilities"])
        select_overlays(state, [], False)
        select_overlays(state, [], True)  # temporary data unavailability must not lose opt-in
        self.assertEqual(state["active_phase4_layers"], ["utilities"])
        set_overlay(state, "regional:utilities", False)
        self.assertEqual(selection_state(overlay_inventory(state, ready)), "Some")
        select_overlays(state, ready, True)
        self.assertEqual(state["active_phase4_layers"], ["utilities"])

    def test_basemap_is_osm_even_with_credentials_and_carto_is_explicit(self):
        self.assertEqual(basemap_config("configured")[2], "OpenStreetMap")
        self.assertEqual(basemap_config("configured", "CARTO Dark Matter")[2], "CARTO Dark Matter")
        self.assertEqual(basemap_config("", "CARTO Dark Matter")[2], "OpenStreetMap")

    def test_empty_inventory(self):
        self.assertEqual(selection_state({}), "Unavailable")


try:
    import folium
    from operational_layer_control import OperationalLayerControl
except ImportError:
    folium = None


@unittest.skipIf(folium is None, "Requires Folium runtime")
class OperationalMapRenderingTests(unittest.TestCase):
    def test_bridge_retains_snapshot_through_viewport_updates_and_fast_toggles(self):
        import json
        import shutil
        import subprocess
        if not shutil.which("node"):
            self.skipTest("Requires Node to execute the rendered bridge")
        map_ = folium.Map()
        first = folium.FeatureGroup().add_to(map_)
        second = folium.FeatureGroup().add_to(map_)
        bridge = OperationalLayerControl({"map_hospitals":first,"user:added":second}).add_to(map_)
        javascript = bridge._template.module.script(bridge)
        prelude = f"""
const assert = require('node:assert/strict');
const sent = [];
const window = {{Streamlit:{{setComponentValue:value=>sent.push(value)}}}};
const {first.get_name()} = {{visible:true}};
const {second.get_name()} = {{visible:true}};
let handler;
const {map_.get_name()} = {{
  closePopup:()=>{{}}, getCenter:()=>({{lat:40.82,lng:-73.12}}), getZoom:()=>11,
  hasLayer:layer=>layer.visible, on:(events,fn)=>{{handler=fn}}
}};
"""
        assertions = f"""
{first.get_name()}.visible=false;
handler({{layer:{first.get_name()},type:'overlayremove'}});
window.Streamlit.setComponentValue({{zoom:11}});
assert.equal(sent.at(-1).overlay_event.visibility.map_hospitals,false);
assert.equal(sent.at(-1).overlay_event.visibility['user:added'],true);
{second.get_name()}.visible=false;
handler({{layer:{second.get_name()},type:'overlayremove'}});
window.Streamlit.setComponentValue({{zoom:12}});
assert.deepEqual(sent.at(-1).overlay_event.visibility,{{map_hospitals:false,'user:added':false}});
assert.equal(sent.at(-1).zoom,12);
"""
        result = subprocess.run(["node","-e",prelude+javascript+assertions],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_hidden_layers_registered_and_view_and_basemap_preserved(self):
        import time
        from types import SimpleNamespace
        from phase4_sources import phase4_source_card
        from map_interaction import leaflet_geometry_parts, map_feature_popup_html, map_feature_tooltip_html
        from tidal_gauges import gauge_marker_color, build_gauge_popup
        tree = ast.parse((ROOT / "streamlit/app.py").read_text())
        function = next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name == "build_map")
        namespace = dict(folium=folium, OperationalLayerControl=OperationalLayerControl,
                         basemap_config=basemap_config, CARTO_API_KEY="configured",
                         CFG=SimpleNamespace(center=[40.7,-73.2],zoom=9), MAP_POINTS={},PHASE4_SOURCES=[],
                         _time=time, leaflet_geometry_parts=leaflet_geometry_parts,
                         map_feature_popup_html=map_feature_popup_html, map_feature_tooltip_html=map_feature_tooltip_html,
                         gauge_marker_color=gauge_marker_color, build_gauge_popup=build_gauge_popup,
                         MAP_BUILDER_FILTER_LABELS={}, MAP_BUILDER_UNFILTERED="unfiltered")
        exec(compile(ast.Module(body=[function],type_ignores=[]),"build_map","exec"),namespace)
        map_ = namespace["build_map"]([],show_radar=False,show_wind=False,show_tidal=False,
                   map_layers=[dict(id="loaded",name="Loaded",features=[dict(type="point",lat=40.8,lng=-73.2,label="Added fixture")],visible=False)],
                   gauge_data={"8516945":{"level":{"lat":40.8,"lng":-73.7,"level_ft":2.5,"station_id":"8516945","color":"#4ade80","status":"NORMAL","trend_str":"steady"}}},center=[40.8,-73.1],zoom=12)
        controls = next(child for child in map_._children.values() if isinstance(child,OperationalLayerControl))
        self.assertEqual(set(controls.overlays), {"show_radar","show_wind","show_tidal","user:loaded"})
        self.assertTrue(all(not layer.show for layer in controls.overlays.values()))
        self.assertGreater(len(controls.overlays["show_tidal"]._children), 0)
        self.assertGreater(len(controls.overlays["user:loaded"]._children), 0)
        tiles = [child for child in map_._children.values() if isinstance(child,folium.TileLayer) and not child.overlay]
        self.assertEqual(len(tiles),1)
        self.assertEqual(tiles[0].layer_name,"OpenStreetMap")
        self.assertEqual(map_.location,[40.8,-73.1])
        self.assertEqual(map_.options["zoom"],12)
        html = map_.get_root().render()
        self.assertIn("window.Streamlit.setComponentValue",html)
        self.assertIn("overlayadd overlayremove",html)
        self.assertIn('"user:loaded"',html)


try:
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None


@unittest.skipIf(AppTest is None, "Requires Streamlit AppTest runtime")
class OverlayWidgetTests(unittest.TestCase):
    def test_bulk_callbacks_update_widgets_before_instantiation(self):
        import textwrap
        source = (ROOT / "streamlit/app.py").read_text()
        names = {"clear_operational_selection", "bulk_operational_visibility", "user_operational_visibility"}
        functions = "\n".join(ast.unparse(node) for node in ast.parse(source).body
                               if isinstance(node, ast.FunctionDef) and node.name in names)
        start = source.index('    st.markdown("**MAP LAYERS**")')
        end = source.index('    g_fetched =', start)
        controls = textwrap.dedent(source[start:end])
        script = f"""import sys
sys.path.insert(0, {str(ROOT / 'streamlit')!r})
import streamlit as st
from map_overlay_selection import *
PHASE4_SOURCES=[{{'id':'regional','display':{{'map_capable':True}}}}]
CARTO_API_KEY='configured'
def eligible_operational_regions(): return ['regional']
{functions}
for key,value in dict(map_layers=[dict(id='added',visible=False,filter_mode='operational',features=[1])],active_phase4_layers=['regional'],show_radar=True,show_wind=True,show_tidal=True,operational_basemap='OpenStreetMap',map_interaction_revision=0).items():
 st.session_state.setdefault(key,value)
for key in STANDARD_IDS: st.session_state.setdefault(f'map_{{key}}',True)
{controls}
st.session_state.setdefault('visible_user:added',False)
st.checkbox('Added layer',key='visible_user:added',on_change=user_operational_visibility,args=('added',))
"""
        app = AppTest.from_string(script).run()
        self.assertFalse(app.exception)
        self.assertEqual(app.selectbox[0].value, "OpenStreetMap")
        app.button[1].click().run()
        self.assertFalse(app.exception)
        self.assertFalse(any(widget.value for widget in app.checkbox))
        app.run()  # ordinary rerun while Off
        self.assertFalse(any(widget.value for widget in app.checkbox))
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertTrue(all(widget.value for widget in app.checkbox))
        app.checkbox[-1].uncheck().run()
        self.assertFalse(app.exception)
        self.assertFalse(app.session_state['map_layers'][0]['visible'])
        self.assertEqual(app.session_state['map_layers'][0]['features'], [1])
        self.assertEqual(app.session_state['map_layers'][0]['filter_mode'], 'operational')
        app.selectbox[0].select('CARTO Dark Matter').run()
        self.assertFalse(app.exception)
        app.run()
        self.assertEqual(app.selectbox[0].value, 'CARTO Dark Matter')
