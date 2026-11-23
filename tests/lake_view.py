"""Run with python tests/lake_view.py after installing Playwright and Chromium."""
import os
from playwright.sync_api import expect, sync_playwright

from col_climbs import ROOT, go, instrument, local_game, travel


def record(page):
    return page.evaluate("""() => {
      climbTest.visibility(true); climbTest.visibility(false);
      const r=JSON.parse(sessionStorage.getItem('ride-draft'));
      return [ride.s,ride.dist,r.s,r.cursor,r.m,r.ascent,r.series.length];
    }""")


def main():
    html=instrument((ROOT/'index.html').read_text(encoding='utf8'))
    with local_game() as url, sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROME_PATH'),args=['--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.route(url+'?*',lambda r:r.fulfill(body=html,content_type='text/html; charset=utf-8'))
            page.goto(url+'?course=core&direction=reverse',wait_until='domcontentloaded')
            page.locator('#loading').wait_for(state='detached',timeout=120000)
            button=page.get_by_role('button',name='View lakeshore',include_hidden=True)
            expect(button).to_be_hidden()
            lake=go(page,'Lake')['distance']
            go(page,'Bottom')
            page.locator('#startWorkout').click()
            page.get_by_role('button',name='Ride',exact=True).first.click()
            travel(page,lake,1200)
            page.evaluate('climbTest.frame(.016)')
            for already_paused in [False,True]:
                if already_paused:
                    page.locator('#pauseWorkout').click()
                before=record(page)
                button.click()
                expect(page.get_by_role('dialog',name='Lac de Bethmale')).to_be_visible()
                expect(page.get_by_role('button',name='Return to bike')).to_be_focused()
                page.keyboard.press('ArrowRight')
                page.evaluate("""() => {
                  const old=performance.now.bind(performance);
                  performance.now=()=>old()+3600000;
                  climbTest.frame(3600);
                  delete performance.now;
                }""")
                assert record(page)==before, 'Viewing altered road position or workout data'
                assert page.evaluate('climbTest.graphics().blur')==0
                if already_paused:
                    page.keyboard.press('Escape')
                else:
                    page.get_by_role('button',name='Return to bike').click()
                expect(button).to_be_focused()
                assert record(page)==before
                expect(page.locator('#pauseWorkout')).to_have_text('Resume' if already_paused else 'Pause')
                expect(page.locator('#climbBest')).to_be_empty()
                if already_paused:
                    page.locator('#pauseWorkout').click()
            travel(page,30000,500)
            expect(page.locator('#climbResult')).to_contain_text('first timed ascent')
            assert float(page.evaluate("localStorage.getItem('ride-core-best-bethmale')"))<1800
            page.evaluate('climbTest.frame(.01)')
            expect(button).to_be_hidden()
            go(page,'Lake')
            page.evaluate('climbTest.frame(.01)')
            button.click()
            page.keyboard.press('Escape')
            travel(page,30000,500)
            expect(page.locator('#climbResult')).to_contain_text('untimed')
            assert not errors,errors
            print('Lakeshore modal, keyboard, active/paused workout, exact position, timed and untimed ascents passed.')
        finally:
            browser.close()


if __name__=='__main__':
    main()
