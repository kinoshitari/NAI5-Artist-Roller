"""Offline tests of real captured DOM parsing, pagination and failed-update preservation."""
import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('updater',ROOT/'scripts/update_artists.py')
updater=importlib.util.module_from_spec(spec);spec.loader.exec_module(updater)
CAPTURE=ROOT/'data/raw/browser-2026-11-22T14-17-46-188Z'

class UpdateTests(unittest.TestCase):
    def test_real_17_pages_produce_exact_1000(self):
        args=types.SimpleNamespace(from_browser=str(CAPTURE),from_snapshots=None,from_html=None)
        artists,pages,duplicates,error=updater.collect(args,CAPTURE)
        self.assertIsNone(error);self.assertEqual(len(pages),17);self.assertEqual(len(artists),1000);self.assertEqual(duplicates,[])
        self.assertEqual(len({a['id'] for a in artists}),1000)
        self.assertEqual(artists,json.loads((ROOT/'data/artists.v5.top1000.json').read_text(encoding='utf-8')))
        self.assertTrue(all('s=favorites' in p['url'] for p in pages))

    def test_listing_and_thumbnail_evidence_are_distinct(self):
        r=json.loads((CAPTURE/'page-06.json').read_text(encoding='utf-8'))
        rows,_,_=updater.parse_browser_snapshot(r)
        a=next(x for x in rows if x['tag']=='kafun')
        self.assertEqual(a['modelEvidence'],'v5_gallery_listing');self.assertEqual(a['sampleModel'],'v45')
        self.assertTrue(any(x['modelEvidence']=='v5_gallery_sample' for x in rows))

    def test_wrong_model_sort_or_page_rejected(self):
        r=json.loads((CAPTURE/'page-01.json').read_text(encoding='utf-8'))
        for url in ['https://tags.gallery/en/v45?s=favorites','https://tags.gallery/en/v5?s=posts','https://tags.gallery/en/v5?s=favorites&p=2']:
            with self.subTest(url=url),self.assertRaises(ValueError):updater.parse_browser_snapshot({**r,'observedUrl':url})

    def test_tampered_row_is_checked_against_actual_html(self):
        r=json.loads((CAPTURE/'page-01.json').read_text(encoding='utf-8'))
        r['rows'][0]['favorites']=999999
        with self.assertRaisesRegex(ValueError,'does not match'):updater.parse_browser_snapshot(r)

    def test_incomplete_update_keeps_previous_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=pathlib.Path(tmp)
            for name in ['artists.v5.top1000.json','artists.v5.top1000.csv','source.json']:(d/name).write_text('previous valid snapshot',encoding='utf-8')
            with patch.object(updater,'DATA',d),patch('sys.argv',['update_artists.py','--from-browser',str(d/'missing')]):
                self.assertEqual(updater.main(),1)
            for name in ['artists.v5.top1000.json','artists.v5.top1000.csv','source.json']:self.assertEqual((d/name).read_text(encoding='utf-8'),'previous valid snapshot')

    def test_partial_publish_failure_rolls_back_committed_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=pathlib.Path(tmp);run=data/'run';run.mkdir()
            names=['artists.v5.top1000.json','artists.v5.top1000.csv','source.json']
            for name in names:(data/name).write_text('previous',encoding='utf-8')
            real_replace=pathlib.Path.replace
            def fail_csv(path,target):
                if path.parent.name=='publish' and path.name.endswith('.csv'):raise OSError('simulated file lock')
                return real_replace(path,target)
            with patch.object(pathlib.Path,'replace',fail_csv),self.assertRaises(OSError):updater.publish_files(data,run,{name:'new' for name in names})
            for name in names:self.assertEqual((data/name).read_text(encoding='utf-8'),'previous')

if __name__=='__main__':unittest.main()
