"""Run with a local ride server and Playwright Chromium. CHROME_PATH can select an installed Chrome."""
import os

from playwright.sync_api import expect, sync_playwright


def check_clocks(browser):
    context = browser.new_context()
    page = context.new_page()
    page.goto(os.getenv("RIDE_URL", "http://127.0.0.1:8791/"))
    page.locator("#loading").wait_for(state="detached", timeout=120_000)
    page.locator("#startWorkout").click()
    page.locator(".planRow").filter(has_text="3 × 8 minutes").get_by_role("button", name="Ride", exact=True).click()
    page.wait_for_function("document.getElementById('workoutElapsed').textContent !== '0:00'")
    page.locator("#pauseWorkout").click()
    elapsed = page.locator("#workoutElapsed").inner_text()
    page.locator("#upcomingSteps button").nth(2).click()
    expect(page.locator("#workoutRemaining")).to_have_text("25:00")
    page.locator("#prevStep").click()
    expect(page.locator("#workoutRemaining")).to_have_text("29:00")
    while page.locator("#nextStep").is_enabled():
        page.locator("#nextStep").click()
    expect(page.locator("#intervalName")).to_contain_text("End of workout")
    expect(page.locator("#workoutRemaining")).to_have_text("0:00")
    expect(page.locator("#workoutElapsed")).to_have_text(elapsed)
    page.locator("#prevStep").click()
    expect(page.locator("#workoutRemaining")).to_have_text("5:00")
    page.locator("#finishWorkout").click()
    expect(page.locator(".reviewChart")).to_be_visible()
    page.locator("#studioClose").click()
    page.locator("#startWorkout").click()
    page.get_by_role("button", name="Start free ride").click()
    expect(page.locator("#remainingLabel")).to_be_hidden()
    expect(page.locator("#workoutElapsed")).to_be_visible()
    context.close()


if __name__ == "__main__":
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        check_clocks(browser)
        browser.close()
        print("Workout elapsed, remaining, pause, jump, finish and free-ride checks passed.")
