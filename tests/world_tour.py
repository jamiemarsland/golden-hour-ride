"""Record one workout across all four worlds and both directions using the normal controls."""
import argparse
import json
import os
from pathlib import Path
from time import monotonic
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from col_climbs import local_game


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--minutes',type=float,default=.1,help='real minutes per stage')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    assert args.minutes>0
    def report(**data):
        print(json.dumps(data),flush=True)
        if args.report:
            with args.report.open('a',encoding='utf8') as stream:
                stream.write(json.dumps(data)+'\n')
    with local_game() as url,sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=['--disable-renderer-backgrounding','--disable-background-timer-throttling'])
        page=browser.new_page(viewport={'width':740,'height':480})
        errors=[]
        outside=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        def local_only(route):
            if urlparse(route.request.url).hostname=='127.0.0.1':
                route.continue_()
            else:
                outside.append(route.request.url)
                route.abort()
        page.route('http**/*',local_only)
        page.goto(url+'?course=valley')
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        page.locator('#settingsButton').click()
        page.locator('#graphicsQuality').select_option('smooth')
        page.locator('#rideMass').fill('87.5')
        page.locator('#rideMass').press('Tab')
        page.get_by_role('button',name='Close settings').click()
        page.locator('#startWorkout').click()
        page.locator('.planRow').first.get_by_role('button',name='Ride',exact=True).click()
        worlds=['valley','richmond','core','leckhampton','valley','richmond','core','leckhampton']
        start=monotonic()
        for i,world in enumerate(worlds):
            if i:
                page.locator('#worldButton').click()
                page.locator('button[data-world="'+world+'"]').click()
                page.locator('#direction').select_option('reverse' if i>=4 else 'forward')
                page.locator('#enterWorld').click()
                page.wait_for_url('**course='+world+'&direction=*',timeout=120000)
                page.locator('#loading').wait_for(state='detached',timeout=120000)
                expect(page.locator('#pauseWorkout')).to_have_text('Resume')
                page.locator('#pauseWorkout').click()
            assert page.evaluate('ride.mass')==87.5
            page.locator('#pwr').fill('220')
            page.locator('#settingsButton').click()
            page.locator('#wx [data-w="'+['golden','overcast','mist','rain'][i%4]+'"]').click()
            page.get_by_role('button',name='Close settings').click()
            page.wait_for_timeout(args.minutes*60000)
            page.locator('#showRouteMap').click()
            expect(page.locator('#mapSummary')).to_contain_text('km')
            page.locator('#mapClose').click()
            report(stage=i+1,world=world,direction='reverse' if i>=4 else 'forward',
                   elapsed=round(monotonic()-start,1),position=round(page.evaluate('ride.s')),
                   workout=page.locator('#workoutElapsed').inner_text())
        page.locator('#finishWorkout').click()
        expect(page.locator('.reviewChart')).to_be_visible()
        row=page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('golden-hour-training');r.onsuccess=()=>ok(r.result)});
          const rides=await new Promise(ok=>{const r=db.transaction('rides').objectStore('rides').getAll();r.onsuccess=()=>ok(r.result)});
          const {s,m,segments,series}=rides[0];db.close();return {s,m,segments,samples:series.length};}""")
        assert [s['course'] for s in row['segments']]==worlds,row
        assert all(s['m']>0 and s['reverse']==(i>=4) for i,s in enumerate(row['segments'])),row
        assert abs(sum(s['m'] for s in row['segments'])-row['m'])<.01
        assert row['s']>=args.minutes*60*8-.8 and not errors and not outside,(row,errors,outside)
        report(saved=row)
        browser.close()


if __name__=='__main__':
    main()
