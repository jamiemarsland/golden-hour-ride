"""Confirm workout actions stay reachable from the saddle on short and narrow displays."""
import os
from playwright.sync_api import expect, sync_playwright


def reachable(page, selector):
    box=page.locator(selector).bounding_box()
    assert box, selector
    x,y=box['x']+box['width']/2,box['y']+box['height']/2
    assert page.evaluate("([x,y,id])=>document.elementFromPoint(x,y)?.closest(id)!==null && !!document.elementFromPoint(x,y)?.closest(id)",[x,y,selector]),(selector,box,page.viewport_size)


def main():
    with sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'))
        page=browser.new_page(viewport={'width':1200,'height':760})
        base=os.getenv('RIDE_URL','http://127.0.0.1:8791/')
        page.goto(base+'?course=core')
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        page.locator('#startWorkout').click()
        page.locator('.planRow').first.get_by_role('button',name='Ride',exact=True).click()
        for w,h in [(1280,720),(1024,600),(390,844),(375,667),(320,568),(640,360),(568,320)]:
            page.set_viewport_size({'width':w,'height':h})
            page.wait_for_timeout(150)
            for selector in ['#nextStep','#finishWorkout','#pauseWorkout','#showRouteMap','#credit']:
                reachable(page,selector)
            page.locator('#pauseWorkout').click()
            expect(page.locator('#pauseWorkout')).to_have_text('Resume')
            page.locator('#pauseWorkout').click()
            page.locator('#credit').click()
            expect(page.locator('#courseSources')).to_contain_text('IGN')
            page.get_by_role('button',name='Close',exact=True).filter(visible=True).click()
        page.locator('#finishWorkout').click()
        expect(page.locator('.reviewChart')).to_be_visible()
        print('Workout controls, map button and data credits reachable in seven viewports')
        browser.close()


if __name__=='__main__':
    main()
