from __future__ import annotations

import json
import secrets
import sqlite3
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from dashboard.demo import demo_manifest
from dashboard.main import create_app
from dashboard.models import Manifest
from dashboard.security import verify_owner_profile
from dashboard.settings import Settings
from dashboard.store import digest

ORIGIN = 'http://127.0.0.1:8787'
LIVE_ORIGIN = 'https://prod.sanegames.swiftsane.com'
TEST_INTAKE = 'unit-test-not-a-real-credential-' + 'x'*48


@pytest.fixture
def demo_client(tmp_path):
    app=create_app(Settings(data_dir=tmp_path/'demo'))
    with TestClient(app, base_url=ORIGIN) as client:
        client.get('/')
        yield client


@pytest.fixture
def live_client(tmp_path):
    config=Settings(mode='production', base_url=LIVE_ORIGIN, data_dir=tmp_path/'live',
                    owner_github_id='12345', github_client_id='test-client',
                    github_client_secret='test-secret-not-real', intake_token=TEST_INTAKE)
    app=create_app(config)
    with TestClient(app, base_url=LIVE_ORIGIN) as client:
        yield client


def owner_headers(client, origin=ORIGIN):
    return {'Origin':origin,'X-CSRF-Token':client.get('/api/state').json()['csrf']}


def candidate(client, release_id='demo-slice-street'):
    return next(x for x in client.get('/api/state').json()['releases'] if x['id']==release_id)


def decision_payload(release, **extra):
    payload={'manifest_hash':release['manifest_hash'],'action':'approve',
             'confirmation':f"APPROVE {release['version']}", 'note':'Reviewed fixture only.',
             'attest_playtested_both':True,'attest_reviewed_evidence':True}
    return payload | extra


def inject_owner_session(client):
    # Test-only authentication fixture. No such shortcut exists in the HTTP API.
    settings=client.app.state.settings
    token,csrf=secrets.token_urlsafe(48),secrets.token_urlsafe(32)
    with client.app.state.store.connect(write=True) as db:
        db.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',(digest(token),settings.owner_github_id,'test-owner',csrf,int(time.time())+3600))
    client.cookies.set(settings.cookie_name,token)
    return {'Origin':LIVE_ORIGIN,'X-CSRF-Token':csrf}


def live_manifest(slug='test-game', **extra):
    m=demo_manifest(slug)
    for item in m['artifacts']+m['evidence']:
        item['url']=item['url'].replace('https://example.invalid/','https://github.com/swiftSaneGames/')
    return m | extra


def create_live_candidate(client, **extra):
    headers={'Authorization':'Bearer '+TEST_INTAKE}
    p={'slug':'test-game','title':'Test Game','category':'Business simulation','summary':'An original test fixture, not a real game.'}
    r=client.post('/api/intake/projects',json=p,headers=headers)
    assert r.status_code in (201,409)
    r=client.post('/api/intake/releases',json=live_manifest(**extra),headers=headers)
    assert r.status_code==201,r.text
    return r.json()


def test_demo_has_explicit_fixtures(demo_client):
    response=demo_client.get('/api/state')
    data=response.json()
    assert data['mode']=='demo'
    assert len(data['projects'])==6
    assert len(data['releases'])==2
    assert all(not v for v in data['integrations'].values())
    assert 'SAMPLE' in data['releases'][0]['manifest']['release_notes']


def test_security_headers(demo_client):
    response=demo_client.get('/')
    assert response.headers['x-frame-options']=='DENY'
    assert 'frame-ancestors' in response.headers['content-security-policy']
    assert "'unsafe-inline'" not in response.headers['content-security-policy']
    assert response.headers['cache-control']=='no-store'
    assert response.headers['referrer-policy']=='no-referrer'


def test_demo_rejects_remote_clients(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path)),base_url=ORIGIN,client=('203.0.113.5',8000)) as c:
        assert c.get('/').status_code==403


def test_invalid_host_rejected(demo_client):
    assert demo_client.get('/',headers={'Host':'attacker.example'}).status_code==400


def test_demo_requires_loopback_origin(tmp_path):
    with pytest.raises(ValueError):
        create_app(Settings(base_url='https://prod.sanegames.swiftsane.com',data_dir=tmp_path))


def test_production_rejects_missing_configuration(tmp_path):
    with pytest.raises(ValueError):
        create_app(Settings(mode='production',base_url=LIVE_ORIGIN,data_dir=tmp_path))


def test_cannot_promote_demo_database_to_live(demo_client):
    with pytest.raises(ValueError):
        demo_client.app.state.store.bind_mode('production')


def test_live_starts_empty_and_private(live_client):
    assert live_client.get('/',follow_redirects=False).status_code==303
    assert live_client.get('/api/state').status_code==401
    headers=inject_owner_session(live_client)
    assert headers
    state=live_client.get('/api/state').json()
    assert state['projects']==[] and state['releases']==[]
    assert state['mode']=='production'


def test_http_live_rejected(live_client):
    assert live_client.get('http://prod.sanegames.swiftsane.com/healthz').status_code==400


def test_agent_cannot_approve(live_client):
    rc=create_live_candidate(live_client)
    r=live_client.post(f"/api/releases/{rc['id']}/decision",json={
        'manifest_hash':rc['manifest_hash'],'action':'approve','confirmation':'APPROVE 1.0.0',
        'attest_playtested_both':True,'attest_reviewed_evidence':True
    },headers={'Authorization':'Bearer '+TEST_INTAKE,'Origin':LIVE_ORIGIN})
    assert r.status_code==401


def test_csrf_required(demo_client):
    rc=candidate(demo_client)
    r=demo_client.post('/api/releases/demo-slice-street/decision',json=decision_payload(rc),headers={'Origin':ORIGIN})
    assert r.status_code==403


def test_cross_origin_write_rejected(demo_client):
    rc=candidate(demo_client)
    headers=owner_headers(demo_client)|{'Origin':'https://attacker.example'}
    assert demo_client.post('/api/releases/demo-slice-street/decision',json=decision_payload(rc),headers=headers).status_code==403


def test_blocked_qa_cannot_be_overridden(demo_client):
    rc=candidate(demo_client,'demo-pocket-pitstop')
    r=demo_client.post('/api/releases/demo-pocket-pitstop/decision',json=decision_payload(rc),headers=owner_headers(demo_client))
    assert r.status_code==409 and 'QA gates' in r.json()['detail']


def test_approval_requires_both_attestations(demo_client):
    rc=candidate(demo_client)
    r=demo_client.post('/api/releases/demo-slice-street/decision',json=decision_payload(rc,attest_playtested_both=False),headers=owner_headers(demo_client))
    assert r.status_code==422


def test_confirmation_phrase_required(demo_client):
    rc=candidate(demo_client)
    r=demo_client.post('/api/releases/demo-slice-street/decision',json=decision_payload(rc,confirmation='yes'),headers=owner_headers(demo_client))
    assert r.status_code==422


def test_approval_binds_hash_and_does_not_publish(demo_client):
    rc=candidate(demo_client)
    url='/api/releases/demo-slice-street/decision'
    r=demo_client.post(url,json=decision_payload(rc,manifest_hash='0'*64),headers=owner_headers(demo_client))
    assert r.status_code==409
    r=demo_client.post(url,json=decision_payload(rc),headers=owner_headers(demo_client))
    assert r.status_code==200
    assert r.json()['status']=='approved' and r.json()['published'] is False
    assert candidate(demo_client)['status']=='approved'
    assert demo_client.app.state.store.audit_chain_valid()


def test_duplicate_approval_rejected(demo_client):
    rc=candidate(demo_client); h=owner_headers(demo_client)
    url='/api/releases/demo-slice-street/decision'
    assert demo_client.post(url,json=decision_payload(rc),headers=h).status_code==200
    assert demo_client.post(url,json=decision_payload(rc),headers=h).status_code==409


def test_requested_fixes_need_notes_and_return_to_building(demo_client):
    rc=candidate(demo_client);h=owner_headers(demo_client)
    url='/api/releases/demo-slice-street/decision'
    assert demo_client.post(url,json=decision_payload(rc,action='request_changes',note='fix'),headers=h).status_code==422
    r=demo_client.post(url,json=decision_payload(rc,action='request_changes',note='Improve the first tutorial and retest both platforms.'),headers=h)
    assert r.status_code==200
    state=demo_client.get('/api/state').json()
    assert next(p for p in state['projects'] if p['slug']=='slice-street')['stage']=='building'


def test_manifest_and_audit_rows_immutable(demo_client):
    store=demo_client.app.state.store
    with pytest.raises(sqlite3.IntegrityError):
        with store.connect(write=True) as db: db.execute("UPDATE releases SET manifest_json='{}'")
    with pytest.raises(sqlite3.IntegrityError):
        with store.connect(write=True) as db: db.execute("DELETE FROM audit")
    assert store.audit_chain_valid()


def test_demo_intake_disabled(demo_client):
    r=demo_client.post('/api/intake/releases',json=live_manifest(),headers={'Authorization':'Bearer '+TEST_INTAKE})
    assert r.status_code==403


def test_unauthenticated_intake_rejected(live_client):
    assert live_client.post('/api/intake/releases',json=live_manifest()).status_code==401


def test_intake_does_not_accept_extra_approval_field(live_client):
    payload=live_manifest()|{'approved':True}
    assert live_client.post('/api/intake/releases',json=payload,headers={'Authorization':'Bearer '+TEST_INTAKE}).status_code==422


def test_intake_requires_both_platforms(live_client):
    payload=live_manifest();payload['artifacts'][1]['platform']='android'
    assert live_client.post('/api/intake/releases',json=payload,headers={'Authorization':'Bearer '+TEST_INTAKE}).status_code==422


def test_intake_requires_unique_evidence_gates(live_client):
    payload=live_manifest();payload['evidence'][1]['gate']=payload['evidence'][0]['gate']
    assert live_client.post('/api/intake/releases',json=payload,headers={'Authorization':'Bearer '+TEST_INTAKE}).status_code==422


def test_links_cannot_embed_credentials_or_unknown_hosts(live_client):
    headers={'Authorization':'Bearer '+TEST_INTAKE}
    for url in ['javascript:alert(1)','https://attacker.example/file','https://user:password@github.com/file','https://github.com/file?token=secret']:
        payload=live_manifest();payload['artifacts'][0]['url']=url
        assert live_client.post('/api/intake/releases',json=payload,headers=headers).status_code==422


def test_intake_idempotency_and_supersession(live_client):
    a=create_live_candidate(live_client)
    b=create_live_candidate(live_client)
    assert a['id']==b['id']
    h=inject_owner_session(live_client)
    rc=next(r for r in live_client.get('/api/state').json()['releases'] if r['id']==a['id'])
    assert live_client.post(f"/api/releases/{a['id']}/decision",json=decision_payload(rc),headers=h).status_code==200
    live_client.cookies.clear()
    c=create_live_candidate(live_client,commit='b'*40)
    assert c['id']!=a['id']
    inject_owner_session(live_client)
    state=live_client.get('/api/state').json()
    assert next(r for r in state['releases'] if r['id']==a['id'])['status']=='superseded'
    assert next(r for r in state['releases'] if r['id']==c['id'])['status']=='awaiting_review'


def test_browser_session_cannot_masquerade_as_intake(live_client):
    inject_owner_session(live_client)
    assert live_client.post('/api/intake/releases',json=live_manifest(),headers={'Authorization':'Bearer '+TEST_INTAKE}).status_code==403


def test_body_size_limit_including_chunked_input(demo_client):
    r=demo_client.post('/api/projects',content=(b'x'*10000 for _ in range(8)),headers={'Content-Type':'application/json'})
    assert r.status_code==413


def test_project_creation_is_record_only(demo_client):
    p={'slug':'new-original','title':'New Original','category':'Puzzle','summary':'An original puzzle-game concept for testing.'}
    r=demo_client.post('/api/projects',json=p,headers=owner_headers(demo_client))
    assert r.status_code==201 and r.json()['repository_created'] is False
    assert demo_client.post('/api/projects',json=p,headers=owner_headers(demo_client)).status_code==409


def test_logout_revokes_session(demo_client):
    assert demo_client.post('/auth/logout',headers=owner_headers(demo_client)).status_code==200
    assert demo_client.get('/api/state').status_code==401


def test_expired_session_cannot_approve(demo_client):
    rc=candidate(demo_client);h=owner_headers(demo_client)
    with demo_client.app.state.store.connect(write=True) as db: db.execute('UPDATE sessions SET expires_at=0')
    assert demo_client.post('/api/releases/demo-slice-street/decision',json=decision_payload(rc),headers=h).status_code==401


def test_owner_identity_and_two_factor_fail_closed(live_client):
    s=live_client.app.state.settings
    for profile in [{'id':999,'two_factor_authentication':True},{'id':12345},{'id':12345,'two_factor_authentication':False}]:
        with pytest.raises(HTTPException):verify_owner_profile(profile,s)
    verify_owner_profile({'id':12345,'two_factor_authentication':True},s)


def test_oauth_uses_pkce_state_and_secure_cookie(live_client):
    r=live_client.get('/auth/github',follow_redirects=False)
    assert r.status_code==303
    query=parse_qs(urlsplit(r.headers['location']).query)
    assert query['code_challenge_method']==['S256'] and len(query['code_challenge'][0])==43
    assert query['scope']==['read:user']
    assert query['redirect_uri']==[LIVE_ORIGIN+'/auth/callback']
    cookie=r.headers['set-cookie']
    assert '__Host-' in cookie and 'Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=lax' in cookie
    assert live_client.get('/auth/callback?state=wrong&code=fake').status_code==403


def test_mocked_oauth_owner_login_and_single_use_state(live_client,monkeypatch):
    # Network responses are mocked. This does not claim real GitHub login was tested.
    r=live_client.get('/auth/github',follow_redirects=False)
    state=parse_qs(urlsplit(r.headers['location']).query)['state'][0]
    observed={}
    class FakeAsyncClient:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):
            observed.update(kwargs['data'])
            return httpx.Response(200,json={'access_token':'fake-token-for-unit-test'},request=httpx.Request('POST',url))
        async def get(self,url,**kwargs):
            return httpx.Response(200,json={'id':12345,'login':'test-owner','two_factor_authentication':True},request=httpx.Request('GET',url))
    monkeypatch.setattr('dashboard.main.httpx.AsyncClient',FakeAsyncClient)
    r=live_client.get(f'/auth/callback?state={state}&code=fake',follow_redirects=False)
    assert r.status_code==303 and observed['code_verifier']
    assert live_client.get('/api/state').json()['owner']=='test-owner'
    assert live_client.get(f'/auth/callback?state={state}&code=fake').status_code==403
    with live_client.app.state.store.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM oauth_states').fetchone()[0]==0
        assert 'fake-token-for-unit-test' not in str([tuple(x) for x in db.execute('SELECT * FROM sessions')])


def test_manifest_download_is_authenticated(live_client,demo_client):
    assert live_client.get('/api/releases/fake/manifest').status_code==401
    r=demo_client.get('/api/releases/demo-slice-street/manifest')
    assert r.status_code==200 and r.headers['content-disposition'].startswith('attachment')
    assert r.json()['project_slug']=='slice-street'


def test_no_api_documentation_or_publish_endpoint(live_client):
    assert live_client.get('/docs').status_code==404
    assert live_client.post('/api/publish').status_code==404
