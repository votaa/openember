"""Run with the Streamlit runtime installed to test actual widget lifecycle."""
import ast
from pathlib import Path
import unittest

try:
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None

ROOT = Path(__file__).resolve().parents[1]

@unittest.skipIf(AppTest is None, "Streamlit AppTest requires the application runtime")
class SharedGeographyWidgetTests(unittest.TestCase):
    def app(self, main_present=True):
        tree=ast.parse((ROOT/"streamlit/app.py").read_text())
        functions="\n\n".join(ast.unparse(node) for node in tree.body if isinstance(node,ast.FunctionDef)
                               and node.name in ["change_layer_geography","render_layer_geography"])
        script=f"""import sys
sys.path.insert(0,{str(ROOT / 'streamlit')!r})
import streamlit as st
from arcgis_map_layers import set_shared_filter, shared_filter_mode
from map_builder_filters import FILTER_MODES as MAP_BUILDER_FILTER_MODES, FILTER_LABELS as MAP_BUILDER_FILTER_LABELS, UNFILTERED as MAP_BUILDER_UNFILTERED
url='https://example.test/FeatureServer/2'
if 'map_layers' not in st.session_state:
 st.session_state.map_layers=[dict(url=url,filter_mode='unfiltered')] if {main_present!r} else []
 st.session_state.mb_layers=[dict(url=url,filter_mode='unfiltered')]
 st.session_state.esri_layer_filters={{}}
"""+functions+"""
if st.button('Add main layer') and not st.session_state.map_layers:
 mode=shared_filter_mode(url,st.session_state.map_layers,st.session_state.mb_layers,st.session_state.esri_layer_filters)
 st.session_state.map_layers.append(dict(url=url,filter_mode=mode))
if st.session_state.map_layers:
 render_layer_geography('Main map geography',st.session_state.map_layers[0],'esri_filter_main:')
render_layer_geography('Geography display filter',st.session_state.mb_layers[0],'esri_filter_builder:')
"""
        return AppTest.from_string(script).run()
    def test_change_from_either_map_and_reset(self):
        app=self.app()
        self.assertFalse(app.exception)
        for widget,mode in [(1,'pseg_long_island'),(0,'operational'),(1,'unfiltered')]:
            app.selectbox[widget].select(mode).run()
            self.assertFalse(app.exception)
            self.assertEqual([w.value for w in app.selectbox],[mode,mode])
    def test_add_main_widget_after_builder_was_filtered(self):
        app=self.app(main_present=False)
        app.selectbox[0].select('pseg_long_island').run()
        self.assertFalse(app.exception)
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertEqual([w.value for w in app.selectbox],['pseg_long_island','pseg_long_island'])
        app.selectbox[0].select('operational').run()
        self.assertFalse(app.exception)
        self.assertEqual([w.value for w in app.selectbox],['operational','operational'])

if __name__ == '__main__': unittest.main()
