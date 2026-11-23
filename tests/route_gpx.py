"""Check map downloads in Chromium against GPX 1.1 and the original survey.

Install playwright and lxml. GPX_SCHEMA may point to a local copy of gpx.xsd.
"""
import math
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from urllib.request import urlopen

from lxml import etree
from playwright.sync_api import expect, sync_playwright

from col_climbs import ROOT, local_game
sys.path.insert(0, str(ROOT/'tools'))
from terrain_grid import to_bng

GPX='{http://www.topografix.com/GPX/1/1}'


def check_browser(page, url, schema, folder):
    worst=0.
    def download(filename):
        nonlocal worst
        page.locator('#showRouteMap').click()
        link=page.locator('#mapGpx')
        expect(link).to_have_attribute('download',filename+'.gpx')
        with page.expect_download() as event:
            link.click()
        target=folder/event.value.suggested_filename
        event.value.save_as(target)
        doc=etree.parse(target)
        schema.assertValid(doc)
        track=doc.find(GPX+'trk')
        points=[(float(p.get('lat')),float(p.get('lon')),float(p.findtext(GPX+'ele')))
                for p in track.iter(GPX+'trkpt')]
        assert all(p.find(GPX+'time') is None for p in track.iter(GPX+'trkpt'))
        page.locator('#mapClose').click()
        for (lat,lon,y),(x,h,z) in zip(points,expected):
            if course=='core':
                px=(lon-1.116)*111320*math.cos(math.radians(42.874))
                pz=(42.874-lat)*111132
            else:
                e,n=to_bng(lat,lon)
                px,pz=e-origin[0],origin[1]-n
            worst=max(worst,math.hypot(px-x,pz-z))
            assert worst<.02 and y==h, (filename,lat,lon,y,h,worst)
        assert len(points)==len(expected)
        return points,track.findtext(GPX+'name')

    for course,first,second in [('richmond','clockwise','anticlockwise'),('leckhampton','forward','reverse')]:
        page.goto(url+'?course='+course,wait_until='domcontentloaded')
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        road,origin=page.evaluate('k=>[RIDE_COURSES[k].road,RIDE_COURSES[k].origin]',course)
        expected=road+[road[0]]
        forward,_=download(course+'-'+first)
        page.locator('#turnAround').click()
        expected.reverse()
        reverse,_=download(course+'-'+second)
        assert reverse==forward[::-1] and forward[0]==forward[-1]

    course='core'
    for direction,side in [('forward','seix'),('reverse','bethmale')]:
        page.goto(url+'?course=core&direction='+direction,wait_until='domcontentloaded')
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        road,summit=page.evaluate('[RIDE_COURSES.core.road,RIDE_COURSES.core.summit]')
        expected=road[:summit+1] if side=='seix' else road[summit:][::-1]
        page.locator('#turnAround').click()
        points,title=download('col-de-la-core-from-'+side)
        assert side in title.lower() and 1392<points[-1][2]<1398
        assert math.dist(points[-1][:2],(42.858903,1.104994))<.0001
    page.goto(url+'?course=valley',wait_until='domcontentloaded')
    page.locator('#loading').wait_for(state='detached',timeout=120000)
    page.locator('#showRouteMap').click()
    expect(page.locator('#mapGpx')).to_be_hidden()
    print(f'Six real downloads passed GPX 1.1, direction, elevation and coordinates. Maximum round-trip discrepancy {worst:.4f} m.')


def main():
    local=os.getenv('GPX_SCHEMA')
    raw=Path(local).read_bytes() if local else urlopen('https://www.topografix.com/GPX/1/1/gpx.xsd',timeout=30).read()
    schema=etree.XMLSchema(etree.fromstring(raw))
    with local_game() as url, sync_playwright() as api, TemporaryDirectory() as temp:
        browser=api.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=['--enable-unsafe-swiftshader'])
        try:
            check_browser(browser.new_page(accept_downloads=True),url,schema,Path(temp))
        finally:
            browser.close()


if __name__=='__main__':
    main()
