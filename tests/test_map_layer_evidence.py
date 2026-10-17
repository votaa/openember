import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"streamlit"))
from map_layer_evidence import fetch_map_layer_evidence, map_layer_context, layer_query_scope

META = {"capabilities":"Query", "objectIdField":"OBJECTID", "fields":[
    {"name":"OBJECTID","type":"esriFieldTypeOID"},
    {"name":"COUNTY_NAME","alias":"County","domain":{"codedValues":[{"code":1,"name":"Nassau"}]}}]}
LAYER = dict(id="fire", name="Fire/EMS", url="https://example.test/FeatureServer/2", metadata=META)

class Response:
    def __init__(self,payload): self.payload=payload
    def raise_for_status(self): pass
    def json(self): return self.payload

class EvidenceTests(unittest.TestCase):
    def fetch(self, layer=None, count=900, error=None, partial=False, group_count=None, question=""):
        self.calls=[]
        def post(url,data,**kwargs):
            self.calls.append(data)
            if error: return Response({"error":{"message":error}})
            if "returnCountOnly" in data: return Response({"count":count})
            if "outStatistics" in data: return Response({"features":[{"attributes":{"COUNTY_NAME":1,"ember_count":count if group_count is None else group_count}}],"exceededTransferLimit":partial})
            return Response({"features":[{"attributes":{"COUNTY_NAME":1}}]})
        return fetch_map_layer_evidence(layer or LAYER,[],post,lambda *a,**k:Response(META),question)
    def test_all_paths_and_browse_cap(self):
        for path in ["search","quick_add","pasted_url"]:
            result=self.fetch(dict(LAYER,entry_path=path,type="esri",features=[{}]*500))
            self.assertEqual(result["complete_count"],900)
            self.assertEqual(result["displayed_subset"],500)
            self.assertEqual(result["samples"],[{"County":"Nassau"}])
            self.assertNotIn("resultRecordCount",self.calls[0])
            self.assertIn("not distinct departments",result["unit"])
    def test_zero_and_failures(self):
        self.assertEqual(self.fetch(count=0)["complete_count"],0)
        for args in [dict(error="down"),dict(count=None),dict(count=True),dict(count="9"),dict(count=-1)]:
            self.assertEqual(self.fetch(**args)["state"],"unavailable")
    def test_filters_hidden_and_unsupported_fail_closed(self):
        for update in [dict(filter_mode="pseg_long_island"),dict(visible=False),dict(url="https://example.test/MapServer")]:
            self.assertEqual(self.fetch(dict(LAYER,**update))["state"],"unavailable")
            self.assertEqual(self.calls,[])
    def test_summaries_reconcile(self):
        result=self.fetch(question="summarize by county")
        self.assertEqual(result["summary"]["rows"],[dict(value="Nassau",count=900)])
        for args in [dict(partial=True),dict(group_count=1)]:
            result=self.fetch(question="summarize by county",**args)
            self.assertEqual(result["summary"]["state"],"unavailable")
            self.assertEqual(result["complete_count"],900)
            self.assertNotIn("rows",result["summary"])
    def test_stale_and_partial_geography(self):
        fixture=json.loads((Path(__file__).resolve().parents[1]/"fixtures/long-island-sources/map-builder-filter-parity.json").read_text())
        for state in ["stale","partial"]:
            records=[dict(record,data_state=state) for record in fixture["geography_records"]]
            with self.assertRaisesRegex(ValueError,"stale_or_partial_geography"):
                layer_query_scope(dict(LAYER,filter_mode="pseg_long_island"),records)
    def test_refresh_remove(self):
        self.assertEqual(self.fetch(count=366)["complete_count"],366)
        self.assertEqual(self.fetch(count=367)["complete_count"],367)
        self.assertNotIn("Fire/EMS",map_layer_context([]))

if __name__ == "__main__": unittest.main()
