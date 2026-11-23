"""Real-time, unaccelerated Col ascent, kilometre screenshots and saved split checks.

Run python tests/col_endurance.py. Configure CHROME_PATH as for col_climbs.py.
The game uses its normal power control and rendering loop throughout the ride.
"""
import argparse
import json
import os
from pathlib import Path
import tempfile
from time import monotonic, strftime

from playwright.sync_api import expect, sync_playwright

from col_climbs import local_game


def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--watts',type=int,choices=range(50,601,5),default=450,metavar='WATTS')
    args.add_argument('--approach',choices=['seix','bethmale'],default='seix')
    args.add_argument('--descend',action='store_true',help='Continue over the pass, coast, stop at the opposite valley and turn.')
    args.add_argument('--output',type=Path)
    opts=args.parse_args()
    from_bethmale=opts.approach=='bethmale'
    side='Les Bordes-sur-Lez · Bethmale valley' if from_bethmale else 'Seix'
    expected_splits=14 if from_bethmale else 13
    folder=opts.output or Path(tempfile.mkdtemp(prefix='golden-hour-'+opts.approach+'-'))
    folder.mkdir(parents=True,exist_ok=True)
    def log(**data):
        with (folder/'progress.jsonl').open('a',encoding='utf8') as file:
            file.write(json.dumps(dict(at=strftime('%H:%M:%S'),**data))+'\n')
    print(f'Real-time ride evidence: {folder}',flush=True)
    with local_game() as url,sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=[
            '--enable-unsafe-swiftshader','--disable-background-timer-throttling',
            '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'])
        try:
            page=browser.new_page(viewport={'width':520,'height':360},device_scale_factor=1)
            page.set_default_timeout(90000)
            page.on('pageerror',lambda error:log(error=str(error)))
            page.goto(url+'?course=core&direction='+('reverse' if from_bethmale else 'forward'),wait_until='domcontentloaded')
            page.locator('#loading').wait_for(state='detached',timeout=180000)
            page.locator('#settingsButton').click()
            page.locator('#graphicsQuality').select_option('smooth')
            page.keyboard.press('Escape')
            page.locator('#pwr').fill(str(opts.watts))
            page.locator('#startWorkout').click()
            page.get_by_role('button',name='Start free ride').click()
            page.locator('#climbNav summary').click()
            page.locator('#toBottom').click()
            elapsed_start=monotonic();next_update=0;last_km=-1
            while True:
                state=page.evaluate("""()=>({distance:ride.s,grade:document.querySelector('#h-gr').textContent,
                  kmh:ride.v*3.6,watts:ride.power,climb:document.querySelector('#climbTime').textContent,
                  split:document.querySelector('#climbSplit').textContent,result:document.querySelector('#climbResult').textContent})""")
                elapsed=monotonic()-elapsed_start
                km=int(state['distance']/1000)
                if km>last_km or state['result']:
                    name='summit' if state['result'] else f'km-{km:02d}'
                    page.screenshot(path=str(folder/(name+'.jpg')),type='jpeg',quality=83)
                    log(event=name,elapsed=elapsed,**state)
                    last_km=km
                if state['result']:
                    assert 'Summit from '+side+' in' in state['result']
                    break
                if elapsed>=next_update:
                    log(event='progress',elapsed=elapsed,**state)
                    next_update=elapsed+59
                page.wait_for_timeout(4000)
            climb_elapsed=elapsed
            if opts.descend:
                crest=state['distance']
                # Set the normal power slider to an easy spin, then coast on the
                # first sustained negative gradient before resuming that input.
                page.locator('#pwr').fill('120')
                page.locator('#descendPass').click()
                last_km=-1;next_update=0;coast_start=None;resumed=False
                while True:
                    view=page.evaluate('''()=>({m:ride.s,kmh:ride.v*3.6,watts:ride.power,
                      grade:parseFloat(document.querySelector('#h-gr').textContent),side:document.querySelector('#climbSide').textContent,
                      time:document.querySelector('#climbTime').textContent,result:document.querySelector('#climbResult').textContent})''')
                    elapsed=monotonic()-elapsed_start
                    km=int((view['m']-crest)/1000)
                    if coast_start is None and km>=1 and view['grade']<-3:
                        coast_start=elapsed
                        page.locator('#pwr').fill('0')
                        log(event='start-coasting',elapsed=elapsed,**view)
                    if coast_start is not None and not resumed and elapsed-coast_start>=70:
                        page.locator('#pwr').fill('120');resumed=True
                        log(event='finish-coasting',elapsed=elapsed,**view)
                    if km>last_km or 'Valley floor' in view['time']:
                        name='valley' if 'Valley floor' in view['time'] else f'descent-{km:02d}'
                        page.screenshot(path=str(folder/(name+'.jpg')),type='jpeg',quality=83)
                        log(event=name,elapsed=elapsed,**view);last_km=km
                    if 'Valley floor' in view['time']:break
                    if elapsed>=next_update:
                        log(event='descending',elapsed=elapsed,**view);next_update=elapsed+59
                    page.wait_for_timeout(4000)
                assert resumed and view['kmh']<.01 and view['result']=='',view
                endpoint=view['m']
                page.wait_for_timeout(1500)
                assert abs(page.evaluate('ride.s')-endpoint)<.001
                page.locator('#turnAround').click()
                page.wait_for_timeout(7000)
                restart=page.locator('#climbTime').inner_text()
                assert ':' in restart and 'km to summit' in restart and 0<page.evaluate('ride.s')<100,restart
                log(event='new-opposite-attempt',climb=restart,side=page.locator('#climbSide').inner_text(),endpoint=endpoint)
            page.locator('#finishWorkout').click()
            page.locator('.reviewChart').wait_for()
            page.reload(wait_until='domcontentloaded')
            page.locator('#loading').wait_for(state='detached',timeout=180000)
            page.locator('#logbtn').click()
            page.locator('.historyRow').first.click()
            page.get_by_text('Kilometre splits',exact=True).click()
            text=page.locator('#studioBody').inner_text()
            assert 'Col de la Core from '+side in text and text.count(' elapsed')==expected_splits,text
            best=page.evaluate("k=>JSON.parse(localStorage.getItem(k))",'ride-core-best-'+opts.approach+'-splits')
            assert len(best['splits'])==expected_splits and best['time']>best['splits'][-1]
            assert all(a<b for a,b in zip(best['splits'],best['splits'][1:]))
            assert abs(best['time']-climb_elapsed)<30
            log(event='verified-history',wallSeconds=elapsed,record=best,review=text)
            print(f"Saved and verified {expected_splits} kilometre splits in {best['time']:.1f}s",flush=True)
        finally:
            browser.close()

if __name__=='__main__':
    main()
