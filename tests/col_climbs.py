"""Browser regression tests for both Col de la Core approaches.

Install: python -m pip install playwright, then python -m playwright install chromium.
Run: python tests/col_climbs.py

Uses a loopback server on an ephemeral port and a fresh browser context. CHROME_PATH
can select a Chromium executable. The test loads the game and its bundled 3D engine locally.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from math import dist, isclose
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def local_game():
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT))
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def instrument(html):
    """Expose a deterministic driver only inside the intercepted test response.

    Fast travel uses the real climb.advance() and distance clamp. Separately,
    frame() calls the complete production loop to test pause/visibility gating.
    Clicks, PB adjudication, storage and the finish screen all use production code.
    """
    schedule = "requestAnimationFrame(tick);"
    initial = "\ntick();\n</script>"
    assert schedule in html and html.count(initial) == 1, "Update test clock anchors"
    return html.replace(schedule, "/* Test runner schedules each frame. */").replace(
        initial,
        """
        window.climbTest = {
          roadClearance() {
            let least=Infinity;
            for(let i=0;i<P.length;i++){
              for(const offset of [-3.5,-1.75,0,1.75,3.5]){
                const p=P[i],r=R[i];
                least=Math.min(least,p.y-meshH(p.x+r.x*offset,p.z+r.z*offset));
              }
            }
            return {least,buildings:real.scenery.buildings.length,
              lakeAccess:real.scenery.lanes.some(([id])=>id===104214063),
              parking:real.scenery.parking.length};
          },
          state() {
            const pose = at(st.s, mkPose());
            return {distance: st.s, length: LEN, point: pose.p.toArray(), tangent: pose.t.toArray()};
          },
          travel(distance, seconds) {
            const travelled = climb.advance(st.s, distance, seconds);
            st.s = bounded(st.s + travelled);
            return travelled;
          },
          frame(seconds) {
            const read = clock.getDelta;
            try { clock.getDelta = () => seconds; tick(); }
            finally { clock.getDelta = read; }
          },
          graphics() {
            return {ratio:renderer.getPixelRatio(), samples:composer.renderTarget1.samples,
              bloom:bloom.enabled, shadows:renderer.shadowMap.autoUpdate, blur:lens.uniforms.uSpeed.value};
          },
          frameTimes(seconds,count) {
            for(let i=0;i<count;i++)watchFrameTime(seconds);
          },
          windTarget() {
            const gain=audio.wind.g.gain, original=gain.setTargetAtTime;
            let target;
            gain.setTargetAtTime=function(value,...args){target=value;return original.call(this,value,...args);};
            try { this.frame(.016); return target; }
            finally { delete gain.setTargetAtTime; }
          },
          visibility(hidden) {
            Object.defineProperty(document, 'hidden', {configurable:true, value:hidden});
            document.dispatchEvent(new Event('visibilitychange'));
          }
        };
        tick();
        </script>""",
    )


def go(page, landmark):
    page.locator("#climbNav summary").click()
    page.locator("#to" + landmark).click()
    return page.evaluate("climbTest.state()")


def travel(page, distance, seconds):
    return page.evaluate("([d,s]) => climbTest.travel(d,s)", [distance, seconds])


def check_side(page, url, direction, title, expected_length, bottom_range):
    page.goto(url + "?course=core&direction=" + direction, wait_until="domcontentloaded")
    page.locator("#loading").wait_for(state="detached", timeout=120000)
    geometry = page.evaluate("climbTest.roadClearance()")
    assert geometry["least"] > .15, geometry
    assert geometry["buildings"] > 200 and geometry["lakeAccess"] and geometry["parking"] >= 2
    assert page.evaluate("climbTest.state().distance") < 10
    expect(page.locator("#climbSide")).to_contain_text(title)
    expect(page.locator("#climbBest")).to_be_empty()

    base = go(page, "Bottom")
    summit = go(page, "Summit")
    assert base["distance"] == 0 and bottom_range[0] < base["point"][1] < bottom_range[1]
    assert abs(summit["distance"] - expected_length) < 60
    assert abs(summit["point"][1] - 1395) < 4
    expect(page.locator("#climbResult")).to_be_empty()
    assert travel(page, 100, 45) == 0, "jumping to summit must hold position"

    lake = go(page, "Lake")
    expect(page.locator("#climbSide")).to_contain_text("Bethmale")
    assert 1045 < lake["point"][1] < 1070, "D17 access to the real Lac de Bethmale"
    travel(page, 30000, 500)
    expect(page.locator("#climbResult")).to_contain_text("untimed")
    expect(page.locator("#climbBest")).to_be_empty()

    go(page, "Bottom")
    page.locator("#skip").click()
    travel(page, 30000, 500)
    expect(page.locator("#climbResult")).to_contain_text("untimed")

    go(page, "Bottom")
    travel(page, 300, 60)
    before = page.evaluate("climbTest.state()")
    page.locator("#turnAround").click()
    after = page.evaluate("climbTest.state()")
    assert dist(before["point"], after["point"]) < 0.001
    assert sum(a*b for a,b in zip(before["tangent"], after["tangent"])) < -0.99999
    page.locator("#worldButton").click()
    expect(page.locator("#directionLabel")).to_have_text("Start from")
    expect(page.locator("#direction")).to_have_value(direction)
    page.locator("#enterWorld").click()
    assert page.evaluate("climbTest.state().distance") == after["distance"]
    page.locator("#turnAround").click()
    travel(page, 30000, 500)
    expect(page.locator("#climbResult")).to_contain_text("untimed")

    go(page, "Bottom")
    page.locator("#startWorkout").click()
    page.get_by_role("button", name="Start free ride").click()
    page.locator("#pauseWorkout").click()
    page.evaluate("climbTest.frame(7200)")
    assert page.evaluate("climbTest.state().distance") == 0, "paused climb advanced"
    page.locator("#pauseWorkout").click()
    page.evaluate("climbTest.visibility(true); climbTest.frame(7200); climbTest.visibility(false)")
    assert page.evaluate("climbTest.state().distance") == 0, "hidden climb advanced"

    # First timed attempt overshoots by 10 m: the finish must use only the first
    # half of its final 20 m frame and exclude the artificial paused/hidden hours.
    line = summit["distance"]
    travel(page, line - 10, 3595)
    assert isclose(travel(page, 20, 10), 10, abs_tol=1e-6)
    result = page.locator("#climbResult")
    expect(result).to_contain_text("60:00")
    expect(result).to_contain_text("first timed ascent")
    expect(page.locator("#climbSplit")).to_contain_text("Km " + str(int(line // 1000)) + " ·")
    stored_key = "ride-core-best-" + ("seix" if direction == "forward" else "bethmale") + "-splits"
    splits = page.evaluate("key => JSON.parse(localStorage.getItem(key)).splits", stored_key)
    assert len(splits) == int(line // 1000)
    assert isclose(splits[0], 3595 * 1000 / (line - 10))
    assert travel(page, 10, 2) == 0
    page.evaluate("climbTest.frame(0)")
    destination = "Les Bordes-sur-Lez" if direction == "forward" else "Seix"
    page.locator("#descendPass").click()
    expect(page.locator("#descendPass")).to_be_hidden()
    expect(page.locator("#climbSide")).to_have_text("Descent to " + destination)
    expect(page.locator("#climbTime")).to_contain_text("Pedal over the crest")
    assert page.evaluate("ride.v") == 0, "Starting a descent supplied free speed"
    assert travel(page, 700, 60) == 700
    downhill = page.evaluate("climbTest.state()")
    assert downhill["distance"] > line and downhill["point"][1] < summit["point"][1]
    travel(page, 50000, 900)
    end = page.evaluate("climbTest.state()")
    assert end["distance"] == end["length"]
    page.wait_for_timeout(300)
    page.evaluate("climbTest.frame(0)")
    expect(page.locator("#climbSide")).to_have_text("Arrived in " + destination)
    expect(page.locator("#climbTime")).to_have_text("Valley floor")
    assert page.evaluate("key => JSON.parse(localStorage.getItem(key)).splits", stored_key) == splits
    page.get_by_role("button",name="Climb from " + destination).click()
    expect(page.locator("#climbTime")).to_contain_text("0:00")
    assert page.evaluate("climbTest.state().distance") == 0

    for seconds, expected_best in [(3660, "60:00"), (3540, "59:00")]:
        go(page, "Bottom")
        portion = seconds * 1000 / line
        travel(page, 1000, portion)
        page.wait_for_timeout(300)
        travel(page, 1, seconds / line)
        expect(page.locator("#climbSplit")).to_contain_text("behind best" if seconds > 3600 else "ahead of best")
        travel(page, line - 1001, seconds - (portion + seconds / line))
        expect(page.locator("#climbBest")).to_contain_text(expected_best)
    expect(result).to_contain_text("personal best by 1:00")
    page.locator("#finishWorkout").click()
    for time in ("1:00:00", "1:01:00", "59:00"):
        expect(page.locator("#studioBody")).to_contain_text(time)
    # Reopen from IndexedDB history after a reload. PB is independent of the
    # ride record and persists per side, so the other approach still starts fresh.
    page.reload(wait_until="domcontentloaded")
    page.locator("#loading").wait_for(state="detached", timeout=120000)
    expect(page.locator("#climbBest")).to_contain_text("59:00")
    page.locator("#logbtn").click()
    page.locator(".historyRow").first.click()
    expect(page.locator(".reviewChart")).to_be_visible()
    entries = page.locator("#studioBody p").all_text_contents()
    climb_entries = [row for row in entries if row.startswith("Col de la Core from ")]
    assert len(climb_entries) == 3 and all(title in row for row in climb_entries), entries
    assert [row.rsplit(" · ", 1)[1] for row in climb_entries] == ["1:00:00", "1:01:00", "59:00"]
    details = page.locator("#studioBody details").filter(has=page.get_by_text("Kilometre splits",exact=True)).first
    details.locator("summary").click()
    expect(details.locator(".planRow")).to_have_count(len(splits))
    page.locator("#studioClose").click()
    print(f"{title}: {line / 1000:.2f} km, both shortcuts, pause/hidden, turnaround, PB and history passed")
    return summit["point"]


def check_settings_and_switch(page):
    page.locator("#settingsButton").click()
    quality = page.locator("#graphicsQuality")
    quality.select_option("detail")
    full = page.evaluate("climbTest.graphics()")
    quality.select_option("smooth")
    smooth = page.evaluate("climbTest.graphics()")
    assert smooth["ratio"] < full["ratio"] and full["samples"] == 4 and smooth["samples"] == 0
    assert full["bloom"] and full["shadows"] and not smooth["bloom"] and not smooth["shadows"]
    assert page.evaluate("ride.v=3;climbTest.frame(.016);climbTest.graphics().blur") < page.evaluate(
        "ride.v=12;climbTest.frame(.016);climbTest.graphics().blur")
    quality.select_option("auto")
    page.evaluate("climbTest.frameTimes(.04,120)")
    assert not page.evaluate("climbTest.graphics().bloom")
    quality.select_option("detail")
    quality.select_option("auto")
    page.evaluate("climbTest.frameTimes(.95,11)")
    assert page.evaluate("climbTest.graphics().bloom"), "Brief stalls must not force a quality change"
    page.evaluate("climbTest.frameTimes(.95,1)")
    assert not page.evaluate("climbTest.graphics().bloom"), "Persistent slow frames should trigger smoother mode"
    quality.select_option("smooth")
    wind = page.locator("#windNoise")
    expect(wind).not_to_be_checked()
    page.locator("#sound").click()
    assert page.evaluate("climbTest.windTarget()") == 0
    wind.check()
    assert page.evaluate("climbTest.windTarget()") > 0
    wind.uncheck()
    assert page.evaluate("climbTest.windTarget()") == 0
    page.get_by_role("button", name="Close settings").click()
    page.locator("#turnAround").click()
    page.locator("#worldButton").click()
    expect(page.locator("#direction")).to_have_value("reverse")
    page.locator("#direction").select_option("forward")
    page.locator("#enterWorld").click()
    page.wait_for_url("**direction=forward")
    page.locator("#loading").wait_for(state="detached", timeout=120000)
    expect(page.locator("#climbSide")).to_contain_text("Seix")
    page.locator("#settingsButton").click()
    expect(quality).to_have_value("smooth")
    expect(wind).not_to_be_checked()
    expect(page.locator("#sound")).to_have_attribute("aria-pressed","true")
    print("Smooth rendering, automatic fallback, speed blur, wind audio and opposite approach passed")


def main():
    html = instrument((ROOT / "index.html").read_text(encoding="utf-8"))
    with local_game() as url, sync_playwright() as driver:
        browser = driver.chromium.launch(
            executable_path=os.environ.get("CHROME_PATH"),
            args=["--enable-unsafe-swiftshader"],
        )
        try:
            context = browser.new_context(ignore_https_errors=True)
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route(url + "?*", lambda route: route.fulfill(body=html, content_type="text/html; charset=utf-8"))
            east = check_side(page, url, "forward", "Seix", 13810, (500, 535))
            west = check_side(page, url, "reverse", "Bethmale", 14140, (550, 585))
            assert dist(east, west) < 0.01, "Approaches did not meet at the same summit"
            check_settings_and_switch(page)
            assert not errors, errors
        finally:
            browser.close()


if __name__ == "__main__":
    main()
