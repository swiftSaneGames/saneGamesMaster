"""Offline UI checks using a TestClient bridge, not real browser-network end-to-end tests.

Useful in environments that prohibit browser URL navigation. These checks do not
validate browser cookie transport, proxy behavior, TLS, or CSP enforcement.
"""
import json
import os
import re
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright
from dashboard.main import create_app
from dashboard.settings import Settings

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.getenv('BROWSER_OUTPUT',str(ROOT/'test-results')))
OUT.mkdir(parents=True,exist_ok=True)
HTML=(ROOT/'dashboard/static/index.html').read_text()
HTML=re.sub(r'<link[^>]*>','',HTML)
HTML=re.sub(r'<script[^>]*>.*?</script>','',HTML,flags=re.S)
CSS=(ROOT/'dashboard/static/app.css').read_text()
JS=(ROOT/'dashboard/static/app.js').read_text()

with tempfile.TemporaryDirectory(prefix='sanegames-offline-') as tmp:
    app=create_app(Settings(data_dir=Path(tmp)))
    with TestClient(app,base_url='http://127.0.0.1:8787') as client:
        client.get('/')
        def bridge(source,path,options):
            if not path.startswith('/api/') and not path.startswith('/auth/logout'):
                raise ValueError('Offline bridge only permits local application API paths')
            headers=dict(options.get('headers',{}))
            headers['Origin']='http://127.0.0.1:8787'
            r=client.request(options.get('method','GET'),path,headers=headers,content=options.get('body'))
            return {'status':r.status_code,'body':r.text}
        with sync_playwright() as p:
            kw={'headless':True}
            if os.getenv('CHROMIUM_PATH'):kw['executable_path']=os.environ['CHROMIUM_PATH']
            browser=p.chromium.launch(**kw)
            def prepare(context):
                page=context.new_page()
                page.expose_binding('studioTestBridge',bridge)
                page.set_content(HTML)
                page.add_style_tag(content=CSS)
                page.add_script_tag(content="""
                    window.fetch=async function(path,options={}) {
                        const result=await window.studioTestBridge(path,options);
                        return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
                    };
                """)
                page.add_script_tag(content=JS)
                page.wait_for_selector('#review-list .review-row')
                return page
            desktop=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1)
            page=prepare(desktop)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
            mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
            mp=prepare(mobile)
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            mp.screenshot(path=str(OUT/'mobile.png'),full_page=True)
            mp.locator('#review-list [data-id="demo-slice-street"]').click()
            assert mp.locator('#release-dialog').is_visible()
            mp.screenshot(path=str(OUT/'mobile-review.png'),full_page=True)
            mp.get_by_role('button',name='Close release review').click()
            mobile.close()
            page.locator('#review-list [data-id="demo-pocket-pitstop"]').click()
            assert page.locator('#decision-form button[type=submit]').is_disabled()
            page.locator('#review-note').fill('Fix the save migration and retest both mobile platforms.')
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
            page.locator('[name=summary]').fill('An original fixture to validate project creation and search.')
            page.get_by_role('button',name='Create project record').click()
            page.wait_for_selector('#project-dialog',state='hidden')
            # Avoid URL navigation in restricted browser environments; hashchange only.
            page.evaluate("location.hash='portfolio'")
            page.locator('#project-search').fill('Browser Test Game')
            page.wait_for_function("document.querySelectorAll('#portfolio-grid .portfolio-card').length === 1")
            for view in ['releases','maintenance','activity','overview']:
                page.evaluate('(v)=>{location.hash=v}',view)
                page.wait_for_function('(v)=>!document.querySelector("#view-"+v).hidden',arg=view)
            assert not errors,errors
            report={'transport':'Offline Chromium UI with an in-process TestClient bridge; NOT a real-network end-to-end test',
                    'desktop_render':True,'mobile_no_horizontal_overflow':True,'mobile_review_dialog':True,
                    'failed_qa_blocks_approval':True,'request_fixes_flow':True,'approval_flow':True,
                    'project_creation':True,'project_search':True,'view_switching':True,'javascript_errors':errors,
                    'real_oauth_tested':False,'browser_cookie_transport_tested':False,'tls_tested':False,
                    'csp_browser_enforcement_tested':False,'store_publishing_tested':False}
            (OUT/'browser-offline-report.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,indent=2))
            browser.close()
