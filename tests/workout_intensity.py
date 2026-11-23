"""Exercise intensity controls, the ERG-facing target, draft recovery and history."""
import os

from playwright.sync_api import expect, sync_playwright


def check_intensity(browser):
    context = browser.new_context(viewport={"width": 390, "height": 640})
    context.add_init_script("""{
      let factory;
      Object.defineProperty(window,'createRideTraining',{
        get:()=>factory,
        set:fn=>{factory=(options)=>{window.testTraining=fn(options);return window.testTraining;};}
      });
    }""")
    page = context.new_page()
    page.goto(os.getenv("RIDE_URL", "http://127.0.0.1:8791/"))
    page.locator("#loading").wait_for(state="detached", timeout=120_000)
    page.locator("#startWorkout").click()
    page.locator(".planRow").filter(has_text="3 × 8 minutes").get_by_role("button", name="Ride", exact=True).click()
    target, value = page.locator("#targetPower"), page.locator("#intensityValue")
    plus, minus = page.locator("#intensityUp"), page.locator("#intensityDown")
    expect(target).to_have_text("120 W")
    page.wait_for_function("document.querySelector('#workoutElapsed').textContent !== '0:00'")
    plus.click()
    expect(target).to_have_text("126 W")
    expect(page.locator("#upcomingSteps button").first).to_contain_text("263 W")
    assert page.evaluate("window.testTraining.watts") == 126
    page.wait_for_timeout(1200)
    page.locator("#pauseWorkout").click()
    assert page.evaluate("window.testTraining.watts") == 0
    page.locator("#upcomingSteps button").first.click()
    expect(target).to_have_text("263 W")
    page.reload()
    page.locator("#loading").wait_for(state="detached", timeout=120_000)
    expect(page.locator("#pauseWorkout")).to_have_text("Resume")
    expect(value).to_have_text("105%")
    expect(target).to_have_text("263 W")
    page.locator("#pauseWorkout").click()
    assert page.evaluate("window.testTraining.watts") == 263
    page.locator("#prevStep").click()
    expect(target).to_have_text("126 W")
    for _ in range(4):
        plus.click()
    expect(value).to_have_text("125%")
    expect(plus).to_be_disabled()
    page.wait_for_timeout(300)
    page.locator("#pauseWorkout").click()
    assert page.evaluate("JSON.parse(sessionStorage.getItem('ride-draft')).visits.at(-1).watts") == 150
    page.locator("#pauseWorkout").click()
    for _ in range(15):
        minus.click()
    expect(value).to_have_text("50%")
    expect(minus).to_be_disabled()
    expect(target).to_have_text("60 W")
    page.wait_for_timeout(300)
    page.locator("#intensityReset").click()
    expect(target).to_have_text("120 W")
    expect(page.locator("#intensityReset")).to_be_disabled()
    page.locator("#finishWorkout").click()
    expect(page.locator(".reviewChart")).to_be_visible()
    row = page.locator(".planRow").filter(has_text="Warm-up")
    expect(row).to_contain_text("60–150 W target")
    page.locator("#studioClose").click()
    page.locator("#startWorkout").click()
    expect(page.locator(".planRow").first).to_contain_text("250 W")
    page.get_by_role("button", name="Start free ride").click()
    expect(page.locator("#intensityControls")).to_be_hidden()
    assert page.evaluate("window.testTraining.watts") is None
    context.close()


if __name__ == "__main__":
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        check_intensity(browser)
        browser.close()
        print("Workout intensity, effective ERG target, skips, reload, limits, reset and history passed.")
