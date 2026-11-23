"""Failed notification setup preserves manual riding; a positive ERG floor still permits pause."""
import os
from playwright.sync_api import sync_playwright, expect
from col_climbs import ROOT, local_game


if __name__=="__main__":
    with local_game() as url,sync_playwright() as api:
        browser=api.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        context=browser.new_context()
        context.add_init_script(path=str(ROOT/"tests"/"ftms_peripheral.js"))
        page=context.new_page()
        page.goto(url)
        page.locator("#loading").wait_for(state="detached",timeout=120000)
        page.locator("#startWorkout").click()
        page.locator(".planRow").first.get_by_role("button",name="Ride",exact=True).click()
        page.locator("#settingsButton").click()
        page.evaluate("testBike.minimum=50;testBike.failTelemetry=true")
        page.locator("#bt").click()
        expect(page.locator("#pwr")).to_be_enabled()
        expect(page.locator("#actualLabel")).to_have_text("Simulated power")
        expect(page.locator("#erg")).to_be_disabled()
        page.evaluate("testBike.failTelemetry=false;testBike.rejectedCyclingPower=true")
        page.locator("#bt").click()
        expect(page.locator("#erg")).to_be_enabled()
        page.locator("#erg").check()
        page.get_by_role("button",name="Close settings").click()
        page.wait_for_function("testBike.commands.at(-1)?.target===120")
        assert page.evaluate("testBike.cyclingPowerAttempts")==1
        page.locator("#pauseWorkout").click()
        page.wait_for_function("testBike.commands.at(-1)?.bytes?.join(',')==='8,2'")
        page.locator("#nextStep").click()
        page.locator("#pauseWorkout").click()
        page.wait_for_function("testBike.commands.at(-1)?.target===250")
        commands=page.evaluate("testBike.commands.map(c=>c.bytes)")
        assert commands[-3:]==[[8,2],[7],[5,250,0]],commands
        assert [5,50,0] not in commands
        page.evaluate("testBike.commands.length=0;testBike.disconnect()")
        expect(page.locator("#actualPower")).to_have_text("No signal")
        page.wait_for_function("testBike.commands.at(-1)?.target===250",timeout=16000)
        expect(page.locator("#erg")).to_be_checked()
        expect(page.locator("#actualPower")).to_have_text("247 W")
        page.evaluate("testBike.ergCapable=false;testBike.commands.length=0;testBike.disconnect()")
        page.wait_for_function("testBike.commands.at(-1)?.opcode===17",timeout=16000)
        expect(page.locator("#erg")).to_be_disabled()
        expect(page.locator("#erg")).not_to_be_checked()
        assert not page.evaluate("testBike.commands.some(c=>c.opcode===5)")
        print("Failed telemetry setup, limited ERG range, pause/resume and capability-aware reconnection passed.",flush=True)
        browser.close()
