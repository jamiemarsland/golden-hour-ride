"""Verify local calendar grouping, historical rides, filtering and repeating a plan."""
from datetime import datetime, timedelta
import os
from playwright.sync_api import expect,sync_playwright


def main():
    with sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'))
        page=browser.new_page(timezone_id='Europe/London')
        page.goto(os.environ.get('RIDE_URL','http://127.0.0.1:8791/'))
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        now=datetime.now().astimezone()
        def ride(day,name):
            return dict(id=name,date=(now-timedelta(days=day)).isoformat(),s=600,m=1000,ascent=20,name=name,
                energy=120000,measured=600,segments=[dict(course='richmond',reverse=False,m=1000)],
                series=[[1,200,'sim']],plan=[dict(label='Warm-up',end=300,watts=120),dict(label='Effort',end=600,watts=240)],stats=[],laps=[])
        page.evaluate("""async rows=>{
         const db=await new Promise(ok=>{const r=indexedDB.open('golden-hour-training');r.onsuccess=()=>ok(r.result)});
         await new Promise(ok=>{const tx=db.transaction('rides','readwrite');for(const r of rows)tx.objectStore('rides').put(r);tx.oncomplete=ok});db.close();
         localStorage.setItem('golden-hour-ride-log',JSON.stringify([{c:'valley',t:Date.now(),m:500,s:80}]));
        }""",[ride(0,'Today ride'),ride(6,'Earlier ride'),ride(8,'Old ride')])
        page.locator('#logbtn').click()
        expect(page.locator('.weekTitle + p')).to_have_text('2.5 km · 21:20 riding')
        expect(page.locator('.historyHeading h3')).to_contain_text('3.5 km')
        expect(page.locator('.historyRow')).to_have_count(3)
        page.locator('.weekBars button').first.click()
        expect(page.locator('.historyRow')).to_have_count(1)
        expect(page.locator('.historyRow')).to_contain_text('Earlier ride')
        page.get_by_role('button',name='All rides',exact=True).click()
        page.locator('.historyRow').filter(has_text='Old ride').click()
        page.get_by_role('button',name='Repeat workout').click()
        expect(page.locator('#targetPower')).to_have_text('120 W')
        page.locator('#nextStep').click()
        expect(page.locator('#targetPower')).to_have_text('240 W')
        page.locator('#finishWorkout').click()
        expect(page.locator('.reviewChart')).to_be_visible()
        page.get_by_role('button',name='‹ History').click()
        expect(page.locator('.historyRow')).to_have_count(4)
        print('Weekly totals, filtered history, legacy entry and repeat workout passed')
        browser.close()


if __name__=='__main__':
    main()
