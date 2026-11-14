import copy,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'streamlit'))
from evidence_summary import document_evidence
from request_scope import resolve_request_scope,weather_snapshots,scoped_weather
from answer_presentation import answer_markdown
from tests.test_cloud_uploads import scope,requests
CASES=json.loads((ROOT/'tests/fixtures/scope/weather-selection.json').read_text())

class EvidenceTests(unittest.TestCase):
    def test_actual_streamlit_context_and_provider_exclude_unselected_prose(self):
        c=CASES[1];doc=dict(name='plan.txt',content='Incident commander: Casey Example\nCone ballast: 10 lb each')
        resolved=resolve_request_scope(c['question'],c['requestedAt'],c['jurisdiction'],c['weather'],[doc])
        raw=dict(success=True,type='forecast',name='point',url=c['weather'][0]['url'],data=c['weather'][0]['data'])
        context=scope['build_context']([doc],[raw],['floodZones'],[],[dict(content='[NOAA: Point]\nSource: '+raw['url']+'\nUNFILTERED_LATER_SENTINEL\n')])
        with patch.object(requests,'post') as post:
            response=post.return_value.__enter__.return_value
            response.iter_lines.return_value=[json.dumps(dict(message=dict(content='recorded'),done=True)).encode()]
            self.assertEqual(''.join(scope['stream_ollama']([dict(role='user',content='tonight')],context,resolved,c['weather'],[doc])),'recorded')
            self.assertEqual(post.call_count,1)
            prompt=post.call_args.kwargs['json']['messages'][0]['content']
            for text in (doc['content'],'FULL_KB_SENTINEL','SOURCE FACTS AND KNOWN GAPS','"temperature":36'):self.assertIn(text,prompt)
            for text in ('UNFILTERED_LATER_SENTINEL','"temperature":34','"temperature":88'):self.assertNotIn(text,prompt)
            self.assertIn('"status":"supplied"',prompt)
    def test_observations_preserve_timestamp_coordinates_and_do_not_become_grid_fields(self):
        c=CASES[6];obs=c['weather'][-1]
        result=dict(ep=dict(id=obs['id'],url=obs['url'],name='KISP'),success=True,fetched_at=c['requestedAt'],data=obs['data'])
        before=copy.deepcopy(result);snap=weather_snapshots([result],c['jurisdiction'])
        self.assertEqual(snap[0]['data'],obs['data']);self.assertEqual(result,before)
        selected=scoped_weather(snap,resolve_request_scope(c['question'],c['requestedAt'],c['jurisdiction'],snap))[0]
        self.assertEqual(selected['observation']['fields']['temperature']['value'],8)
        self.assertEqual(selected['observation']['coordinates'],[-73.1,40.8])
        self.assertEqual(selected['series'],{})
    def test_markdown_presentation_keeps_original_text_and_blocks_inline_and_reference_images(self):
        text='## Facts\n![inline](https://example.invalid/a)\n![ref][image]\n\n[image]: https://example.invalid/b'
        shown=answer_markdown(text)
        self.assertNotIn('![',shown);self.assertIn('&#33;[inline]',shown);self.assertIn('![inline]',text)
        self.assertEqual(answer_markdown('partial **Markdown'),'partial **Markdown')

if __name__=='__main__':unittest.main()
