"""Optional real-browser checks. Requires Playwright and an installed Chromium browser."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.getenv('BROWSER_OUTPUT', str(ROOT/'test-results')))
OUT.mkdir(parents=True,exist_ok=True)

with tempfile.TemporaryDirectory(prefix='sanegames-browser-') as tmp:
    env=os.environ|{'APP_MODE':'demo','BASE_URL':'http://127.0.0.1:8787','STUDIO_DATA_DIR':tmp}
    process=subprocess.Popen([sys.executable,'-m','uvicorn','dashboard.main:create_app','--factory','--host','127.0.0.1','--port','8787','--no-access-log'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(60):
            try:
                urlopen('http://127.0.0.1:8787/healthz',timeout=1).close();break
            except OSError:time.sleep(.15)
        else:raise RuntimeError('Test server did not start')
        with sync_playwright() as p:
            kwargs={'headless':True}
            if os.getenv('CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CHROMIUM_PATH']
            browser=p.chromium.launch(**kwargs)
            context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1)
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
            page.goto('http://127.0.0.1:8787/')
            page.wait_for_selector('#review-list .review-row')
            assert page.locator('#demo-banner').is_visible()
            assert page.locator('#review-list .review-row').count()==2
            page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            mp=mobile.new_page();mp.goto('http://127.0.0.1:8787/');mp.wait_for_selector('#review-list .review-row')
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            mp.screenshot(path=str(OUT/'mobile.png'),full_page=True)
            mp.locator('#review-list [data-id="demo-slice-street"]').click()
            assert mp.locator('#release-dialog').is_visible()
            mp.screenshot(path=str(OUT/'mobile-review.png'),full_page=True)
            mp.get_by_role('button',name='Close release review').click()
            mobile.close()
            page.locator('#review-list [data-id="demo-pocket-pitstop"]').click()
            assert page.locator('#decision-form button[type=submit]').is_disabled()
            page.locator('#review-note').fill('Fix the save migration before this candidate returns for review.')
            page.get_by_role('button',name='Request fixes').click()
            page.wait_for_selector('#release-dialog',state='hidden')
            page.wait_for_function("document.querySelectorAll('#review-list .review-row').length === 1")
            page.locator('#review-list [data-id="demo-slice-street"]').click()
            page.locator('#attest-play').check();page.locator('#attest-evidence').check()
            page.locator('#confirmation').fill('APPROVE 1.0.0')
            page.get_by_role('button',name='Record demo approval').click()
            page.wait_for_selector('#release-dialog',state='hidden')
            page.wait_for_function("document.querySelectorAll('#review-list .review-row').length === 0")
            page.get_by_role('button',name='New project').click()
            page.locator('[name=title]').fill('Browser Test Game')
            page.locator('[name=slug]').fill('browser-test-game')
            page.locator('[name=summary]').fill('An original testing fixture to verify the project form.')
            page.get_by_role('button',name='Create project record').click()
            page.wait_for_selector('#project-dialog',state='hidden')
            page.locator('[data-view=portfolio]').click()
            page.locator('#project-search').fill('Browser Test Game')
            page.wait_for_function("document.querySelectorAll('#portfolio-grid .portfolio-card').length === 1")
            for view in ['releases','maintenance','activity','overview']:
                page.locator(f'[data-view={view}]').click()
                assert page.locator(f'#view-{view}').is_visible()
            assert not errors,errors
            report={'desktop_render':True,'mobile_no_horizontal_overflow':True,'mobile_release_dialog':True,'blocked_approval':True,'request_fixes_flow':True,'approval_flow':True,'project_creation':True,'project_search':True,'navigation':True,'browser_errors':errors,'store_publishing_tested':False,'real_oauth_tested':False}
            (OUT/'browser-report.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,indent=2))
            browser.close()
    finally:
        process.terminate()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
