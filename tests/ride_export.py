"""Exercise actual browser downloads for historical and current ride formats."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TCX = '{http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2}'
AE = '{http://www.garmin.com/xmlschemas/ActivityExtension/v2}'

def run():
    with sync_playwright() as api, TemporaryDirectory() as temp:
        browser = api.chromium.launch(channel=os.environ.get('RIDE_CHROME_CHANNEL','chrome'), headless=True)
        page = browser.new_page(accept_downloads=True)
        page.set_content('<button>Export</button>')
        page.add_script_tag(path=str(ROOT/'ride-export.js'))
        rows = [[1,197,'trainer',2.6,915.1,1020,89.5],[2,None,'trainer',6.1,916,2400,None],[3,203,'sim',8.4,916.3,11600]]
        for series in [rows, [r[:3] for r in rows], []]:
            ride = dict(name='A & B <intervals>',date='2026-11-23T15:22:00.000Z',s=3,m=8.4,series=series)
            page.evaluate('r=>document.querySelector("button").onclick=()=>exportRideTcx(r)',ride)
            with page.expect_download() as download:page.get_by_role('button').click()
            path = Path(temp)/download.value.suggested_filename
            download.value.save_as(path)
            root=ET.parse(path).getroot()
            assert root.tag==TCX+'TrainingCenterDatabase'
            assert root.find('.//'+TCX+'Lap/'+TCX+'DistanceMeters').text=='8.40'
            pts=root.findall('.//'+TCX+'Trackpoint')
            assert len(pts)==len(series)
            assert root.find('.//'+TCX+'Notes').text.startswith(ride['name'])
            if series:
                assert [w.text for w in root.iter(AE+'Watts')]==['197','203']
                assert pts[1].find('.//'+AE+'Watts') is None
                if len(series[0])>3:
                    assert [c.text for c in root.iter(TCX+'Cadence')]==['90']
                    assert pts[-1].find(TCX+'Time').text.endswith('11.600Z')
                    assert pts[-1].find(TCX+'AltitudeMeters').text=='916.3'
                else:
                    assert pts[-1].find(TCX+'AltitudeMeters') is None
                    assert not list(root.iter(TCX+'Cadence'))
            if os.environ.get('RIDE_TCX_SAMPLE') and series==rows:
                Path(os.environ['RIDE_TCX_SAMPLE']).write_bytes(path.read_bytes())
        browser.close()
    print('Local TCX exports passed for current, legacy and empty sessions.')

if __name__=='__main__':run()
