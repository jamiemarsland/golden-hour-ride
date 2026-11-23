"""Real workout UI, saved samples and TCX with FTMS cadence and CPS crank packets."""
import os
import xml.etree.ElementTree as ET
from col_climbs import ROOT, local_game
from ride_export import TCX
from playwright.sync_api import expect, sync_playwright


def ride(browser,url,dual):
    context=browser.new_context(viewport={"width":390,"height":640},accept_downloads=True)
    context.add_init_script(path=str(ROOT/"tests"/"ftms_peripheral.js"))
    page=context.new_page()
    page.goto(url)
    page.locator("#loading").wait_for(state="detached",timeout=120000)
    page.locator("#startWorkout").click()
    page.get_by_role("button",name="Start free ride").click()
    metric=page.locator("#cadenceMetric")
    value=page.locator("#cadenceValue")
    expect(metric).to_be_hidden()
    if dual:page.evaluate("testBike.hasCyclingPower=true;testBike.cadence=null")
    page.locator("#settingsButton").click()
    page.locator("#bt").click()
    expect(page.locator("#erg")).to_be_enabled()
    page.get_by_role("button",name="Close settings").click()
    if dual:
        # Power balance, accumulated torque, and wheel counters precede the
        # crank fields. Both crank count and 1/1024 s clock wrap between samples.
        def crank(count,ticks):
            page.evaluate("([c,t])=>testBike.crankPacket([0x35,0,200,0,50,0,0,0,0,0,0,0,0,c&255,c>>8,t&255,t>>8])",[count,ticks])
        crank(65535,65000)
        expect(metric).to_be_hidden()
        crank(1,1000)
        expect(value).to_have_text("80 rpm")
        expect(page.locator("#actualPower")).to_have_text("200 W")
        # Unchanged crank counters do not manufacture a new sample.
        for _ in range(7):
            crank(1,1000)
            page.wait_for_timeout(500)
        expect(value).to_have_text("—")
        page.evaluate("testBike.cadence=95")
        expect(value).to_have_text("95 rpm")
        crank(2,2024)
        expect(value).to_have_text("95 rpm")
    else:
        expect(value).to_have_text("80 rpm")
        page.evaluate("testBike.cadence=0")
        expect(value).to_have_text("0 rpm")
        page.wait_for_timeout(1600)
        page.evaluate("testBike.cadence=null")
        expect(value).to_have_text("—",timeout=8000)
        expect(page.locator("#actualPower")).to_have_text("117 W")
        page.wait_for_timeout(1500)
        page.evaluate("testBike.cadence=95")
        expect(value).to_have_text("95 rpm")
    assert metric.evaluate("e=>e.getBoundingClientRect().right<=innerWidth")
    page.wait_for_timeout(1500)
    page.locator("#finishWorkout").click()
    with page.expect_download() as download:
        page.get_by_role("button",name="Export TCX").click()
    points=ET.parse(download.value.path()).findall(".//"+TCX+"Trackpoint")
    samples=[p.findtext(TCX+"Cadence") for p in points]
    assert "95" in samples and None in samples,samples
    if not dual:assert "0" in samples,samples
    context.close()


if __name__=="__main__":
    with local_game() as url,sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        ride(browser,url,False)
        ride(browser,url,True)
        browser.close()
        print("FTMS, crank counter rollover, secondary cadence, signal expiry, mobile layout and TCX passed.")
