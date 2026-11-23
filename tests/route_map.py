"""Exercise live route maps in a disposable mobile browser context against the local ride server."""
import math
import os
import re

from playwright.sync_api import expect, sync_playwright


def check_map(browser):
    context = browser.new_context(viewport={"width": 390, "height": 640})
    # Observe the rider arrow through the canvas API to catch an endpoint tangent
    # accidentally drawn towards the opposite valley when the cyclist turns around.
    context.add_init_script("""{
      const original=CanvasRenderingContext2D.prototype.rotate;
      CanvasRenderingContext2D.prototype.rotate=function(angle){
        if(this.canvas.id==='mapCanvas'){const m=this.getTransform();window.mapArrow=[m.e,m.f,angle];}
        return original.call(this,angle);
      };
    }""")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    base = os.getenv("RIDE_URL", "http://127.0.0.1:8791/").split("?")[0]

    def read_map():
        page.locator("#showRouteMap").click()
        expect(page.locator("#routeMap")).to_be_visible()
        expect(page.locator("#mapSummary")).to_contain_text("km total")
        arrow = page.evaluate("window.mapArrow")
        summary = page.locator("#mapSummary").inner_text()
        bounds = page.locator("#mapCanvas").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= page.viewport_size["width"]
        profile = page.get_by_role("img", name=re.compile(r"Full-route elevation, \d+ to \d+ metres"))
        expect(profile).to_be_visible()
        expect(profile).to_have_attribute("aria-describedby", "mapSummary mapLegend")
        profile_bounds = profile.bounding_box()
        assert profile_bounds["y"] >= bounds["y"] + bounds["height"]
        position = profile.evaluate("""canvas => {
          const {width, height} = canvas;
          const pixels = canvas.getContext('2d').getImageData(0,0,width,height).data;
          let sum = 0, marker = 0, shaded = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const [r,g,b,a] = pixels.subarray(i,i+4);
            if (a === 255 && r === 121 && g === 232 && b === 200) {
              sum += (i / 4) % width;
              marker++;
            }
            if (a === 255 && r === 57 && g === 77 && b === 57) shaded++;
          }
          if (!marker || !shaded) throw Error('Missing rider cursor or elevation silhouette');
          return sum / marker / width;
        }""")
        dialog = page.locator("#routeMap")
        assert dialog.evaluate("el => el.scrollWidth <= el.clientWidth + 1")
        page.locator("#mapClose").click()
        return arrow, summary, position

    def landmark(button):
        page.locator("#climbNav summary").click()
        page.locator("#" + button).click()

    for world, title in (("valley", "Golden Valley"), ("richmond", "Richmond Park"),
                         ("leckhampton", "Leckhampton Hill"), ("core", "Col de la Core")):
        page.goto(f"{base}?course={world}", wait_until="domcontentloaded")
        page.locator("#loading").wait_for(state="detached", timeout=120_000)
        page.locator("#startWorkout").click()
        page.get_by_role("button", name="Start free ride").click()
        page.locator("#pauseWorkout").click()
        if world == "core":
            landmark("toBottom")
        arrow, summary, position = read_map()
        expect(page.locator("#mapTitle")).to_have_text(title)
        page.locator("#turnAround").click()
        returned, same_position, turned_position = read_map()
        assert summary == same_position
        assert abs(position - turned_position) < .002
        assert math.dist(arrow[:2], returned[:2]) < 0.1
        assert math.cos(arrow[2] - returned[2]) < -0.96
        if world == "core":
            assert summary.startswith("0.0 km by road from Seix")
            landmark("toLake")
            _, lake, lake_position = read_map()
            landmark("toSummit")
            _, summit, summit_position = read_map()
            assert position < summit_position < lake_position
            assert float(lake.split()[0]) > float(summit.split()[0]) > 13
            assert re.search(r"139[0-9] m elevation", summit)
            expect(page.locator("#mapLegend li")).to_have_count(4)
            page.set_viewport_size({"width": 740, "height": 390})
            assert all("km" in label for label in page.locator("#mapLegend li").all_text_contents())
            _, landscape, _ = read_map()
            assert landscape == summit
            page.set_viewport_size({"width": 1280, "height": 800})
            assert read_map()[1] == summit
            print("Lake:", lake, "Summit:", summit)
        page.locator("#finishWorkout").click()
        expect(page.locator(".reviewChart")).to_be_visible()
        print(title, summary, "U-turn and mobile layout passed.", flush=True)
    assert not errors, errors
    context.close()


if __name__ == "__main__":
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        check_map(browser)
        browser.close()
