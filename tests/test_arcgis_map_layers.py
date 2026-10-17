import ast
import copy
import json
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "streamlit"))
from arcgis_map_layers import (fetch_scoped_map_features, normalize_map_features,
                              operational_layer_status, refresh_operational_layer,
                              set_shared_filter, shared_filter_mode, synchronize_filters)
from map_layer_evidence import fetch_map_layer_evidence, layer_query_scope

FIXTURE = json.loads((ROOT / "fixtures/long-island-sources/map-builder-filter-parity.json").read_text())
URL = "https://example.test/FeatureServer/2"
META = {"capabilities": "Query", "fields": [{"name": "name", "type": "esriFieldTypeString"}]}

class Response:
    def __init__(self, payload, error=False): self.payload, self.error = payload, error
    def raise_for_status(self):
        if self.error: raise ValueError("HTTP 503")
    def json(self): return self.payload

class SharedMapTests(unittest.TestCase):
    def setUp(self):
        self.geo = copy.deepcopy(FIXTURE["geography_records"])
        self.builder = [dict(id="usa_fire_ems_2", url=URL, type="Feature Layer", filter_mode="pseg_long_island")]
        self.main = [dict(id="esri_real_portal_id_2", name="Fire/EMS", url=URL, type="esri", features=[dict(type="point", lat=30, lng=30)], count=1)]
        self.registry = {}
    def test_aliases_share_the_sublayer_scope_in_either_add_order(self):
        synchronize_filters(self.main, self.builder, self.registry)
        self.assertEqual(self.main[0]["filter_mode"], "pseg_long_island")
        self.assertEqual(shared_filter_mode(URL+"/", self.main, [], self.registry), "pseg_long_island")
        set_shared_filter(URL,"operational",self.main,self.builder,self.registry)
        self.assertEqual(self.main[0]["filter_mode"],self.builder[0]["filter_mode"])
        other=dict(id="hospitals",url=URL[:-1]+"0",filter_mode="unfiltered")
        set_shared_filter(URL,"pseg_long_island",self.main,[*self.builder,other],self.registry)
        self.assertEqual(other["filter_mode"],"unfiltered")
        with self.assertRaises(ValueError): set_shared_filter(URL,"bad",self.main,self.builder,self.registry)
    def fetch(self, mode, fail_geojson=False, outside=False, count=None):
        self.calls=[]
        def request(url, **options):
            params=options.get("data") or options.get("params")
            self.calls.append((url,options))
            if params["f"]=="geojson" and fail_geojson: return Response({"error":{"message":"GeoJSON unsupported"}})
            features = [dict(type="Feature", geometry=f["geometry"], properties={"id":f["id"]})
                        for f in FIXTURE["features"] if outside or f["id"] in FIXTURE["expected"][mode]]
            if count is not None: features=[features[0]]*count
            return Response(dict(features=features))
        return fetch_scoped_map_features(dict(url=URL,filter_mode=mode,metadata=META),self.geo,request,request)
    def test_both_geographies_are_sent_before_browse_cap_and_match_chat(self):
        for mode in ["pseg_long_island","operational"]:
            result=self.fetch(mode)
            query=self.calls[0][1]["data"]
            self.assertEqual(query["resultRecordCount"],500)
            self.assertEqual(query["geometryType"],"esriGeometryPolygon")
            self.assertEqual(query["spatialRel"],"esriSpatialRelIntersects")
            scope=layer_query_scope(dict(url=URL,filter_mode=mode),self.geo)
            self.assertTrue(all(query[k]==v for k,v in scope.items()))
            self.assertEqual([f["props"]["id"] for f in result["features"]],FIXTURE["expected"][mode])
    def test_format_fallback_retains_geography_and_count_cap(self):
        self.fetch("pseg_long_island",fail_geojson=True)
        first,second=[options["data"] for _,options in self.calls]
        self.assertEqual({k:v for k,v in first.items() if k!="f"},{k:v for k,v in second.items() if k!="f"})
    def test_unfiltered_is_explicit_and_capped(self):
        result=self.fetch("unfiltered",count=500)
        self.assertEqual(result["browse_state"],"partial")
        self.assertNotIn("geometry",self.calls[0][1]["params"])
    def test_source_ignoring_geometry_is_rejected_instead_of_drawing_wrong_points(self):
        with self.assertRaisesRegex(ValueError,"source_returned_out_of_scope_features"):
            self.fetch("pseg_long_island",outside=True)
    def test_missing_or_stale_masks_do_not_send_an_unfiltered_request(self):
        def forbidden(*args,**kwargs): self.fail("no upstream query may run")
        for records in [[],[dict(r,data_state="stale") for r in self.geo]]:
            with self.assertRaises(ValueError):
                fetch_scoped_map_features(dict(url=URL,filter_mode="operational",metadata=META),records,forbidden,forbidden)
    def test_native_arcgis_geometry_is_not_duplicated(self):
        features=normalize_map_features([dict(attributes={"name":"local"},geometry={"x":5,"y":5})])
        self.assertEqual(len(features),1)
        self.assertEqual(features[0]["lat"],5)
    def test_refresh_switch_reset_failure_and_valid_zero(self):
        layer=dict(self.main[0],filter_mode="pseg_long_island",visible=True)
        def good(layer,records): return self.fetch(layer["filter_mode"])
        def bad(*args): raise ValueError("upstream failed")
        refresh_operational_layer(layer,self.geo,good,now=100)
        self.assertEqual(layer["count"],2)
        self.assertEqual(layer["browse_state"],"complete")
        # Same-scope failure retains only records known to match that scope and is stale.
        refresh_operational_layer(layer,self.geo,bad,now=161)
        self.assertEqual(layer["count"],2)
        self.assertEqual(layer["data_state"],"stale")
        self.assertIn("same scope",operational_layer_status(layer))
        evidence=fetch_map_layer_evidence(layer,self.geo,lambda *a,**k:self.fail("no count query"),lambda *a,**k:self.fail("no metadata query"))
        self.assertEqual(evidence["state"],"unavailable")
        # Switching geography cannot preserve the prior scope's records.
        layer["filter_mode"]="operational"
        refresh_operational_layer(layer,self.geo,bad,now=162)
        self.assertEqual(layer["features"],[])
        self.assertEqual(layer["data_state"],"unavailable")
        refresh_operational_layer(layer,self.geo,good,now=163,force=True)
        self.assertEqual(layer["count"],4)
        layer["filter_mode"]="unfiltered"
        refresh_operational_layer(layer,self.geo,good,now=164)
        self.assertEqual(layer["count"],5)
        refresh_operational_layer(layer,self.geo,lambda *a:dict(features=[],browse_state="complete",metadata=META),now=165,force=True)
        self.assertEqual(layer["count"],0)
        self.assertIsNone(layer["map_query_error"])
        self.assertEqual(layer["data_state"],"current")
    def test_callbacks_sync_before_main_map_and_chat_render(self):
        tree=ast.parse((ROOT/"streamlit/app.py").read_text())
        callback=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="change_layer_geography")
        class State(dict):
            def __getattr__(self,key): return self[key]
            def __setattr__(self,key,value): self[key]=value
        state=State(map_layers=self.main,mb_layers=self.builder,esri_layer_filters={},widget="operational")
        namespace=dict(st=SimpleNamespace(session_state=state),set_shared_filter=set_shared_filter,MAP_BUILDER_FILTER_MODES=("unfiltered","operational","pseg_long_island"))
        exec(compile(ast.Module(body=[callback],type_ignores=[]),"callback","exec"),namespace)
        namespace["change_layer_geography"](URL,"widget")
        self.assertEqual(self.main[0]["filter_mode"],"operational")
        self.assertEqual(self.builder[0]["filter_mode"],"operational")
        self.assertEqual(state.esri_layer_filters[URL],"operational")
        state["widget"]=None
        namespace["change_layer_geography"](URL,"widget")
        self.assertEqual(self.main[0]["filter_mode"],"operational")
    def test_main_map_add_inherits_builder_scope_despite_different_item_ids(self):
        tree=ast.parse((ROOT/"streamlit/app.py").read_text())
        add=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="add_operational_esri_layer")
        class State(dict):
            def __getattr__(self,key): return self[key]
        state=State(map_layers=[],mb_layers=self.builder,esri_layer_filters={})
        seen=[]
        def query(layer,records):
            seen.append(layer["filter_mode"])
            return self.fetch(layer["filter_mode"])
        namespace=dict(st=SimpleNamespace(session_state=state),shared_filter_mode=shared_filter_mode,
                       refresh_operational_layer=refresh_operational_layer,
                       current_geography_records=lambda:self.geo,query_operational_features=query)
        exec(compile(ast.Module(body=[add],type_ignores=[]),"add","exec"),namespace)
        result=namespace["add_operational_esri_layer"]("real_portal_id","Fire/EMS",dict(url=URL,id=2,name="Stations",metadata=META))
        self.assertIsNone(result["error"])
        self.assertEqual(result["total"],2)
        self.assertEqual(seen,["pseg_long_island"])
        self.assertEqual(state.map_layers[0]["filter_mode"],"pseg_long_island")
        namespace["add_operational_esri_layer"]("another_alias","Fire/EMS",dict(url=URL,id=2,name="Stations",metadata=META))
        self.assertEqual(len(state.map_layers),1)

    def test_scope_change_invalidates_browse_even_before_cache_expiry(self):
        layer=dict(self.main[0],filter_mode="pseg_long_island")
        calls=[]
        def fetch(layer,records):
            calls.append(layer["filter_mode"])
            return self.fetch(layer["filter_mode"])
        refresh_operational_layer(layer,self.geo,fetch,now=100)
        refresh_operational_layer(layer,self.geo,fetch,now=101)
        layer["filter_mode"]="operational"
        refresh_operational_layer(layer,self.geo,fetch,now=102)
        self.assertEqual(calls,["pseg_long_island","operational"])

if __name__=="__main__": unittest.main()
