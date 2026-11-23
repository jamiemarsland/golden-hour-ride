"""Exercise custom workout edits, removal, immutable history and preference write failures."""
import os
from col_climbs import local_game
from playwright.sync_api import expect, sync_playwright


def run(page,url):
    page.goto(url)
    page.locator("#loading").wait_for(state="detached",timeout=120000)
    page.locator("#startWorkout").click()
    button=lambda name:page.get_by_role("button",name=name,exact=True)
    row=lambda name:page.locator(".planRow").filter(has=page.get_by_text(name,exact=True))
    row("3 × 8 minutes").get_by_role("button",name="Edit").click()
    expect(button("Delete workout")).to_have_count(0)
    page.get_by_label("Workout name").fill("Sunday intervals")
    page.get_by_label("Effort target (W)").fill("290")
    button("Save workout").click()
    expect(row("3 × 8 minutes")).to_contain_text("250 W")
    custom=row("Sunday intervals")
    custom.get_by_role("button",name="Ride").click()
    page.locator("#nextStep").click()
    expect(page.locator("#targetPower")).to_have_text("290 W")
    page.locator("#finishWorkout").click()
    page.locator("#studioClose").click()
    page.locator("#startWorkout").click()
    custom.get_by_role("button",name="Edit").click()
    page.get_by_label("Power targets").select_option("ftp")
    page.get_by_label("Reference FTP (W)").fill("240")
    page.get_by_label("Effort target (% FTP)").fill("110")
    page.get_by_label("Easy target (% FTP)").fill("60")
    button("Save workout").click()
    expect(custom).to_contain_text("110% FTP (264 W)")
    custom.get_by_role("button",name="Edit").click()
    page.get_by_label("Reference FTP (W)").fill("250")
    page.get_by_label("Repeats").fill("4")
    button("Save workout").click()
    expect(custom).to_contain_text("4 × 8 min at 110% FTP (275 W)")
    expect(custom).to_have_count(1)
    custom.get_by_role("button",name="Ride").click()
    expect(page.locator("#targetPower")).to_have_text("150 W")
    page.locator("#nextStep").click()
    expect(page.locator("#targetPower")).to_have_text("275 W")
    page.locator("#finishWorkout").click()
    page.locator("#studioClose").click()
    page.locator("#startWorkout").click()
    custom.get_by_role("button",name="Edit").click()
    page.once("dialog",lambda prompt:prompt.dismiss())
    button("Delete workout").click()
    expect(button("Save workout")).to_be_visible()
    page.once("dialog",lambda prompt:prompt.accept())
    button("Delete workout").click()
    expect(custom).to_have_count(0)
    expect(page.locator(".planRow")).to_have_count(2)
    page.reload()
    page.locator("#loading").wait_for(state="detached",timeout=120000)
    # Repeats of the two older rides retain their original target watts.
    for idx,easy,effort in ((1,120,290),(1,150,275)):
        page.locator("#logbtn").click()
        page.locator(".historyRow").nth(idx).click()
        button("Repeat workout").click()
        expect(page.locator("#targetPower")).to_have_text(f"{easy} W")
        page.locator("#nextStep").click()
        expect(page.locator("#targetPower")).to_have_text(f"{effort} W")
        page.locator("#finishWorkout").click()
        page.locator("#studioClose").click()
    page.locator("#startWorkout").click()
    button("Build a workout").click()
    page.get_by_label("Workout name").fill("Write once")
    page.get_by_label("Power targets").select_option("ftp")
    page.get_by_label("Reference FTP (W)").fill("260")
    page.evaluate("""() => {
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='ride-builder-ftp')throw new DOMException('Full preference storage','QuotaExceededError');
        return original.call(this,key,value);
      };
    }""")
    button("Save workout").click()
    expect(row("Write once")).to_have_count(1)
    assert page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('ride-plan:')).length")==1


if __name__=="__main__":
    with local_game() as url,sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv("CHROME_PATH"))
        page=browser.new_page(viewport={"width":390,"height":640})
        run(page,url)
        browser.close()
        print("Edited and removed one custom plan, preserved both historical target sets, and survived unavailable preference storage.")
