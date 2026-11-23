"""A real-time 47-minute 5 × 5 workout, including a pause, ERG change and signal gap."""
from pathlib import Path
import os
import tempfile
import time
import xml.etree.ElementTree as ET

from col_climbs import ROOT, local_game
from ride_export import TCX, AE
from playwright.sync_api import expect, sync_playwright


def run(page,url):
    page.goto(url+"?course=valley")
    page.locator("#loading").wait_for(state="detached",timeout=120000)
    page.locator("#settingsButton").click()
    page.locator("#graphicsQuality").select_option("smooth")
    page.locator("#bt").click()
    expect(page.locator("#erg")).to_be_enabled()
    page.locator("#erg").check()
    page.get_by_role("button",name="Close settings").click()
    page.locator("#startWorkout").click()
    page.locator(".planRow").filter(has_text="5 × 5 minutes").get_by_role("button",name="Ride",exact=True).click()
    start=time.monotonic()
    effort=lambda i:f"Effort {i} of 5"
    sequence=["Warm-up"]
    for i in range(1,6):
        sequence.append(effort(i))
        if i<5:sequence.append(f"Recovery {i}")
    sequence+=["Cool-down","End of workout · free ride"]
    visited=[]
    next_report=start
    while True:
        name=page.locator("#intervalName").inner_text()
        if name not in visited:
            assert name==sequence[len(visited)], (visited,name)
            visited.append(name)
            if name==sequence[-1]:break
            if name==effort(2):page.locator("#intensityUp").click()
            if name=="Recovery 2":page.locator("#intensityReset").click()
            target=(294 if name==effort(2) else 280) if name.startswith("Effort") else 120
            expect(page.locator("#targetPower")).to_have_text(f"{target} W")
            page.wait_for_function("w=>testBike.commands.filter(c=>c.opcode===5).at(-1)?.target===w",arg=target)
            expect(page.locator("#actualPower")).to_have_text(f"{target-3} W",timeout=12000)
            print(name,target,"W ERG confirmed",flush=True)
            if name=="Warm-up":
                page.locator("#pauseWorkout").click()
                frozen=page.locator("#workoutElapsed").inner_text()
                page.wait_for_function("testBike.commands.filter(c=>c.opcode===5).at(-1)?.target===0")
                page.wait_for_timeout(6000)
                expect(page.locator("#workoutElapsed")).to_have_text(frozen)
                page.locator("#pauseWorkout").click()
                page.wait_for_function("testBike.commands.filter(c=>c.opcode===5).at(-1)?.target===120")
                page.evaluate("testBike.transmitting=false")
                expect(page.locator("#actualPower")).to_have_text("No signal",timeout=15000)
                page.wait_for_timeout(5000)
                page.evaluate("testBike.transmitting=true")
                expect(page.locator("#actualPower")).to_have_text("117 W",timeout=12000)
                print("Paused, resumed, dropped power notifications, detected no signal, recovered.",flush=True)
        if time.monotonic()>=next_report:
            print("Monitor",page.locator("#workoutElapsed").inner_text(),name,
                  page.locator("#actualPower").inner_text(),flush=True)
            next_report=time.monotonic()+60
        assert time.monotonic()-start<49*60,"workout exceeded real-time deadline"
        page.wait_for_timeout(1500)
    duration=time.monotonic()-start
    assert 2824<=duration<=2850,duration
    page.locator("#finishWorkout").click()
    expect(page.locator(".reviewChart")).to_be_visible()
    expect(page.locator("#studioBody")).to_contain_text("Trainer readings")
    for row in page.locator("#studioBody .planRow").all():
        expect(row).to_contain_text("Complete")
    page.reload()
    page.locator("#loading").wait_for(state="detached",timeout=120000)
    page.locator("#logbtn").click()
    page.locator(".historyRow").first.click()
    with page.expect_download() as download:
        page.get_by_role("button",name="Export TCX").click()
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/"ride.tcx"
        download.value.save_as(path)
        tree=ET.parse(path)
        pts=tree.findall(".//"+TCX+"Trackpoint")
        watts=[p.find(".//"+AE+"Watts") for p in pts]
        missing=sum(w is None for w in watts)
        recorded={int(w.text) for w in watts if w is not None}
        assert 2<=missing<=15 and {117,277,291}<=recorded,(missing,recorded)
        assert float(tree.find(".//"+TCX+"Lap/"+TCX+"TotalTimeSeconds").text)>=2820
        print(f"Finished in {duration:.1f} wall seconds; {len(pts)} exported trackpoints, {missing} without watts.",flush=True)


if __name__=="__main__":
    with local_game() as url,sync_playwright() as api:
        browser=api.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        context=browser.new_context(viewport={"width":700,"height":450},accept_downloads=True)
        context.add_init_script(path=str(ROOT/"tests"/"ftms_peripheral.js"))
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda err:errors.append(str(err)))
        run(page,url)
        assert not errors,errors
        browser.close()
