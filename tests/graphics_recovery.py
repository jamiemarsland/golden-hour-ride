"""Recover an actual browser graphics context during a workout and while already paused."""
import os
from playwright.sync_api import expect, sync_playwright
from col_climbs import local_game


def main():
    with local_game() as url, sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=['--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':800,'height':600})
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(url)
        page.locator('#loading').wait_for(state='detached',timeout=120000)
        page.locator('#startWorkout').click()
        page.locator('.planRow').first.get_by_role('button',name='Ride',exact=True).click()
        page.wait_for_function('ride.s>2')
        page.evaluate("window.resetTest=document.querySelector('#c').getContext('webgl2').getExtension('WEBGL_lose_context')")
        for already_paused in [False,True]:
            if already_paused:
                page.locator('#pauseWorkout').click()
            page.evaluate('resetTest.loseContext()')
            expect(page.locator('#graphicsRecovery')).to_be_visible()
            before=page.evaluate("[ride.s,sessionStorage.getItem('ride-draft')]")
            page.keyboard.press('Escape')
            expect(page.locator('#graphicsRecovery')).to_be_visible()
            page.wait_for_timeout(1600)
            page.evaluate('resetTest.restoreContext()')
            expect(page.locator('#continueGraphics')).to_be_visible(timeout=15000)
            assert before==page.evaluate("[ride.s,sessionStorage.getItem('ride-draft')]")
            page.locator('#continueGraphics').click()
            expect(page.locator('#graphicsRecovery')).to_be_hidden()
            expect(page.locator('#pauseWorkout')).to_have_text('Resume' if already_paused else 'Pause')
            if not already_paused:
                page.wait_for_function('s=>ride.s>s',arg=before[0])
        page.locator('#finishWorkout').click()
        expect(page.locator('.reviewChart')).to_be_visible()
        assert not errors,errors
        browser.close()
        print('Two real context losses restored the road, preserved the workout and respected Pause.')


if __name__=='__main__':
    main()
