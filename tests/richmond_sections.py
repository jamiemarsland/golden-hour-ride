"""Exercise mapped hill crossings in the real Richmond scene and recorded ride."""
import os
from col_climbs import ROOT, instrument, local_game
from playwright.sync_api import expect, sync_playwright


def check(page, url, initial_reverse):
    direction = "reverse" if initial_reverse else "forward"
    page.goto(url + "?course=richmond&direction=" + direction)
    page.locator("#loading").wait_for(state="detached", timeout=120000)
    page.evaluate("localStorage.setItem('ride-richmond-section:broomfield:cw','1')")
    card = page.locator("#richmondSection")
    expect(card).to_be_hidden()
    page.locator("#startWorkout").click()
    page.get_by_role("button", name="Start free ride").click()
    distances = []
    for i, name in enumerate(("Broomfield Hill", "Dark Hill", "Sawyer’s Hill")):
        def approach():
            return page.evaluate("i => sectionTest.position(i)", i)

        length = approach()
        distances.append(round(length))
        page.evaluate("climbTest.frame(.1)")
        expect(card).to_contain_text(name + " ahead")
        page.evaluate("sectionTest.travel(30,6)")
        expect(card).to_contain_text("m left")
        page.locator("#skip").click()
        expect(card).to_be_hidden()
        page.evaluate("sectionTest.travel(20,4)")
        expect(card).to_be_hidden()
        approach()
        page.evaluate("sectionTest.travel(40,8)")
        page.locator("#turnAround").click()
        expect(card).to_be_hidden()
        page.locator("#turnAround").click()
        approach()
        page.evaluate("sectionTest.travel(30,6)")
        page.locator("#pauseWorkout").click()
        page.evaluate("climbTest.frame(3600)")
        page.locator("#pauseWorkout").click()
        page.evaluate("s => sectionTest.travel(s,s/5)", length)
        expect(card).to_contain_text("Personal best")
        record = page.evaluate("JSON.parse(sessionStorage.getItem('ride-draft')).parkSections")
        assert len(record) == i+1
        assert record[-1]["reverse"] is initial_reverse
        assert abs(record[-1]["seconds"] - length/5) < 0.01
        assert card.evaluate("el=>el.getBoundingClientRect().right <= innerWidth")
    # Broomfield follows the mapped paved road; an old footpath detour measured 1,058 m.
    for measured,expected in zip(distances,(968,972,1995)):
        assert abs(measured-expected)<5,(measured,expected)
    page.locator("#finishWorkout").click()
    for name in ("Broomfield Hill", "Dark Hill", "Sawyer’s Hill"):
        expect(page.locator("#studioBody")).to_contain_text(name + " · " + ("Anticlockwise" if initial_reverse else "Clockwise"))
    print(direction, "section distances", distances, "metres", flush=True)


if __name__ == "__main__":
    # Only the served test document exposes positioning and fast travel. Production
    # route sampling, timing, ride controls, PB storage and history are unchanged.
    html = instrument((ROOT/"index.html").read_text(encoding="utf8")).replace(
        "window.climbTest = {", """
        window.sectionTest={
          position(i){
            const item=richmondHillSections[i];
            function line([x,z]) {
              const i=nearRoad(x,z).i;
              const d=i*LEN/P.length;
              return turned?bounded(-d):d;
            }
            const start=line(reverse?item.b:item.a),end=line(reverse?item.a:item.b);
            richmondSections.reset();st.s=bounded(start-20);
            return bounded(end-start);
          },
          travel(m,t){richmondSections.advance(st.s,m,t,reverse);st.s=bounded(st.s+m);}
        }; window.climbTest = {""")
    with local_game() as url, sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=os.environ.get("CHROME_PATH"))
        context = browser.new_context(viewport={"width":390,"height":640})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route(url + "?*", lambda route: route.fulfill(body=html, content_type="text/html; charset=utf-8"))
        check(page,url,False)
        check(page,url,True)
        page.reload()
        page.locator("#loading").wait_for(state="detached",timeout=120000)
        page.locator("#logbtn").click()
        page.locator(".historyRow").first.click()
        expect(page.locator("#studioBody")).to_contain_text("Dark Hill · Anticlockwise")
        page.locator("#studioClose").click()
        page.locator("#turnAround").click()
        length=page.evaluate("sectionTest.position(0)")
        page.evaluate("sectionTest.travel(40,8)")
        expect(page.locator("#richmondSection")).to_contain_text("Clockwise")
        expect(page.locator("#richmondSection")).to_contain_text("Best")
        page.locator("#startWorkout").click()
        page.get_by_role("button",name="Start free ride").click()
        page.evaluate("s=>sectionTest.travel(s,s/3)",length)
        expect(page.locator("#richmondSection")).to_contain_text("Finished")
        page.locator("#finishWorkout").click()
        expect(page.locator(".reviewChart")).to_be_visible()
        expect(page.locator("#studioBody")).not_to_contain_text("Broomfield Hill")
        assert not errors, errors
        browser.close()
