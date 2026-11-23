"""Round-trip recorded and legacy history through the file controls in fresh browsers."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import json
from playwright.sync_api import expect, sync_playwright


def ready(context):
    page=context.new_page()
    page.goto(os.getenv('RIDE_URL','http://127.0.0.1:8791/'))
    page.locator('#loading').wait_for(state='detached',timeout=120000)
    return page


def main():
    with TemporaryDirectory() as directory,sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=os.getenv('CHROME_PATH'))
        src=ready(browser.new_context(accept_downloads=True))
        src.evaluate("""()=>localStorage.setItem('golden-hour-ride-log',JSON.stringify([{t:'2023-01-02T09:00:00Z',c:'valley',s:90,m:300}]))""")
        src.locator('#startWorkout').click()
        src.locator('.planRow').first.get_by_role('button',name='Ride',exact=True).click()
        src.wait_for_timeout(1200)
        src.locator('#finishWorkout').click()
        src.get_by_role('button',name='‹ History').click()
        src.locator('.historyFiles summary').click()
        with src.expect_download() as downloaded:
            src.get_by_role('button',name='Download history backup').click()
        path=Path(directory)/'rides.json'
        downloaded.value.save_as(path)
        data=json.loads(path.read_text())
        assert len(data['rides'])==len(data['legacy'])==1 and data['rides'][0]['series']
        src.context.close()
        dest=ready(browser.new_context())
        dest.locator('#logbtn').click()
        dest.locator('.historyFiles summary').click()
        dest.locator('.historyFiles input').set_input_files(path)
        expect(dest.locator('.historyFiles [role=status]')).to_have_text('2 added · 0 already saved')
        expect(dest.locator('.historyRow')).to_have_count(1)
        expect(dest.locator('#studioBody')).to_contain_text('0.3 km')
        dest.locator('.historyFiles input').set_input_files(path)
        expect(dest.locator('.historyFiles [role=status]')).to_have_text('0 added · 2 already saved')
        broken=Path(directory)/'invalid.json'
        data['rides'].append({'id':'invalid'})
        broken.write_text(json.dumps(data))
        dest.locator('.historyFiles input').set_input_files(broken)
        expect(dest.locator('.historyFiles [role=status]')).to_contain_text('Could not restore')
        expect(dest.locator('.historyRow')).to_have_count(1)
        dest.locator('.historyRow').click()
        expect(dest.locator('.reviewChart')).to_be_visible()
        expect(dest.locator('#studioBody')).to_contain_text('Simulated readings')
        browser.close()
        print('Backup download, new-browser restore, legacy ride, duplicate handling, malformed file and stored power passed')


if __name__=='__main__':
    main()
