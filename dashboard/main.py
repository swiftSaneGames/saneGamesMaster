from __future__ import annotations

import base64
import hashlib
import json
import secrets
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import demo
from .models import Decision, Manifest, ProjectInput
from .security import BodyLimitMiddleware, RateLimiter, csrf_check, intake_check, owner_session, validate_links, verify_owner_profile
from .settings import Settings
from .store import Store, canonical, digest, now

STATIC = Path(__file__).parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate()
    store = Store(settings.data_dir)
    store.bind_mode(settings.mode)
    if not settings.live:
        demo.seed(store)
    app = FastAPI(title="SaneGames Studio Control", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    app.state.settings = settings
    app.state.limiter = RateLimiter()
    host = urlsplit(settings.base_url).hostname
    allowed = [host] if settings.live else [host, "localhost", "127.0.0.1", "[::1]"]
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed, www_redirect=False)

    @app.middleware("http")
    async def protections(request: Request, call_next):
        if not settings.live and request.client and request.client.host not in {"127.0.0.1", "::1", "testclient"}:
            response = JSONResponse({"detail": "Demo is loopback-only"}, status_code=403)
        elif settings.live and request.url.scheme != "https":
            response = JSONResponse({"detail": "HTTPS is required; check the trusted reverse proxy configuration"}, status_code=400)
        elif (request.url.path.startswith("/auth/") or request.method == "POST") and not app.state.limiter.allow(
            f"{request.client.host if request.client else 'unknown'}:{'auth' if request.url.path.startswith('/auth/') else 'write'}", 30
        ):
            response = JSONResponse({"detail": "Too many requests; try again later"}, status_code=429, headers={"Retry-After": "60"})
        else:
            response = await call_next(request)
        response.headers.update({
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        })
        if settings.live:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.exception_handler(sqlite3.OperationalError)
    async def database_error(request, exc):
        return JSONResponse({"detail": "Database temporarily unavailable; retry the operation"}, status_code=503)

    def session(request: Request, write=False) -> dict:
        result = owner_session(request, settings, store)
        if write:
            csrf_check(request, result, settings)
        return result

    def set_session(response: Response, user_id: str, login: str, old_token: str = ""):
        token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
        with store.connect(write=True) as db:
            db.execute("DELETE FROM sessions WHERE expires_at<=? OR token_hash=?", (int(time.time()), digest(old_token)))
            db.execute("INSERT INTO sessions VALUES(?,?,?,?,?)", (digest(token), user_id, login, csrf, int(time.time()) + 3600))
        response.set_cookie(settings.cookie_name, token, max_age=3600, secure=settings.live, httponly=True, samesite="lax", path="/")

    @app.get("/healthz")
    def health():
        return {"status": "ok"}

    @app.get("/")
    def home(request: Request):
        response = FileResponse(STATIC / "index.html")
        try:
            session(request)
        except HTTPException:
            if settings.live:
                return RedirectResponse("/login", status_code=303)
            set_session(response, "demo-owner", "Demo owner", request.cookies.get(settings.cookie_name, ""))
        return response

    @app.get("/login")
    def login():
        if not settings.live:
            return RedirectResponse("/", status_code=303)
        return FileResponse(STATIC / "login.html")

    @app.get("/auth/github")
    def auth_start():
        if not settings.live:
            raise HTTPException(403, "OAuth is disabled in demo mode")
        state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        with store.connect(write=True) as db:
            db.execute("DELETE FROM oauth_states WHERE expires_at<=?", (int(time.time()),))
            db.execute("INSERT INTO oauth_states VALUES(?,?,?)", (digest(state), verifier, int(time.time()) + 600))
        query = urlencode({
            "client_id": settings.github_client_id,
            "redirect_uri": settings.base_url + "/auth/callback",
            "scope": "read:user", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256", "allow_signup": "false",
        })
        response = RedirectResponse("https://github.com/login/oauth/authorize?" + query, status_code=303)
        response.set_cookie(settings.oauth_cookie, state, secure=True, httponly=True, samesite="lax", max_age=600, path="/")
        return response

    @app.get("/auth/callback")
    async def auth_callback(request: Request):
        if not settings.live:
            raise HTTPException(403, "OAuth is disabled in demo mode")
        state, code = request.query_params.get("state", ""), request.query_params.get("code", "")
        cookie = request.cookies.get(settings.oauth_cookie, "")
        if not state or len(state) > 200 or not code or len(code) > 1000 or not secrets.compare_digest(state, cookie):
            raise HTTPException(403, "OAuth state validation failed")
        with store.connect(write=True) as db:
            row = db.execute("SELECT * FROM oauth_states WHERE state_hash=?", (digest(state),)).fetchone()
            db.execute("DELETE FROM oauth_states WHERE state_hash=?", (digest(state),))
        if not row or row["expires_at"] <= int(time.time()):
            raise HTTPException(403, "OAuth sign-in expired or was already used")
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                token_response = await client.post("https://github.com/login/oauth/access_token", headers={"Accept": "application/json"}, data={
                    "client_id": settings.github_client_id, "client_secret": settings.github_client_secret,
                    "code": code, "redirect_uri": settings.base_url + "/auth/callback", "code_verifier": row["verifier"],
                })
                token_response.raise_for_status()
                token = token_response.json().get("access_token")
                if not token:
                    raise HTTPException(403, "GitHub authorization failed")
                user_response = await client.get("https://api.github.com/user", headers={
                    "Authorization": "Bearer " + token,
                    "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
                })
                user_response.raise_for_status()
                profile = user_response.json()
                # This token is never persisted or used for repository writes.
                del token
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(502, "GitHub sign-in is temporarily unavailable")
        verify_owner_profile(profile, settings)
        response = RedirectResponse("/", status_code=303)
        response.delete_cookie(settings.oauth_cookie, secure=True, httponly=True, samesite="lax", path="/")
        set_session(response, str(profile["id"]), profile.get("login", "Owner"), request.cookies.get(settings.cookie_name, ""))
        with store.connect(write=True) as db:
            store.audit(db, "owner_signed_in", str(profile["id"]), "dashboard")
        return response

    @app.post("/auth/logout")
    def logout(request: Request):
        session(request, write=True)
        with store.connect(write=True) as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (digest(request.cookies.get(settings.cookie_name, "")),))
        response = JSONResponse({"ok": True})
        response.delete_cookie(settings.cookie_name, secure=settings.live, httponly=True, samesite="lax", path="/")
        return response

    def serialize_release(row):
        result = dict(row)
        result["manifest"] = json.loads(result.pop("manifest_json"))
        result["gates_pass"] = result["manifest"]["blocking_issues"] == 0 and all(e["status"] == "pass" for e in result["manifest"]["evidence"])
        return result

    @app.get("/api/state")
    def state(request: Request):
        user = session(request)
        with store.connect() as db:
            projects = [dict(x) for x in db.execute("SELECT * FROM projects ORDER BY created_at, title")]
            releases = [serialize_release(x) for x in db.execute("SELECT r.*,p.title FROM releases r JOIN projects p ON p.slug=r.project_slug ORDER BY r.created_at DESC, r.id")]
            events = [dict(seq=x["seq"], event_hash=x["event_hash"], **json.loads(x["event_json"])) for x in db.execute("SELECT * FROM audit ORDER BY seq DESC LIMIT 60")]
        return {
            "mode": settings.mode, "owner": user["login"], "csrf": user["csrf"],
            "deployment_target": "prod.sanegames.swiftsane.com", "projects": projects, "releases": releases,
            "events": events, "audit_chain_valid": store.audit_chain_valid(),
            "integrations": {"agent_intake": settings.live, "github_sync": False, "store_publishing": False, "mac_workers": False},
        }

    @app.get("/api/releases/{release_id}/manifest")
    def manifest_download(release_id: str, request: Request):
        session(request)
        with store.connect() as db:
            row = db.execute("SELECT manifest_json FROM releases WHERE id=?", (release_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Release candidate not found")
        return Response(row["manifest_json"], media_type="application/json", headers={"Content-Disposition": 'attachment; filename="release-manifest.json"'})

    @app.post("/api/releases/{release_id}/decision")
    def decide(release_id: str, decision: Decision, request: Request):
        user = session(request, write=True)
        with store.connect(write=True) as db:
            row = db.execute("SELECT * FROM releases WHERE id=?", (release_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Release candidate not found")
            if row["status"] != "awaiting_review":
                raise HTTPException(409, "This candidate is no longer awaiting review; refresh the dashboard")
            if not secrets.compare_digest(decision.manifest_hash, row["manifest_hash"]):
                raise HTTPException(409, "The reviewed manifest does not match this candidate")
            candidate = json.loads(row["manifest_json"])
            if decision.action == "approve":
                if candidate["blocking_issues"] or not all(x["status"] == "pass" for x in candidate["evidence"]):
                    raise HTTPException(409, "Approval blocked: all eight QA gates must pass with zero blocking issues")
                if decision.confirmation != f"APPROVE {row['version']}":
                    raise HTTPException(422, "Type the exact release confirmation phrase")
                if not decision.attest_playtested_both or not decision.attest_reviewed_evidence:
                    raise HTTPException(422, "Confirm both platform playtests and the complete review pack")
                status = "approved"
            else:
                if len(decision.note.strip()) < 10:
                    raise HTTPException(422, "Describe the requested fixes in at least 10 characters")
                status = "changes_requested"
            db.execute("UPDATE releases SET status=?,decided_at=?,decided_by=?,decision_note=? WHERE id=?", (status, now(), user["user_id"], decision.note, release_id))
            if status == "changes_requested":
                db.execute("UPDATE projects SET stage='building' WHERE slug=?", (row["project_slug"],))
            store.audit(db, "demo_" + status if not settings.live else status, user["user_id"], release_id, {
                "manifest_hash": row["manifest_hash"], "note": decision.note,
                "attest_playtested_both": decision.attest_playtested_both, "attest_reviewed_evidence": decision.attest_reviewed_evidence,
                "store_submission": "not_connected",
            })
        return {"status": status, "published": False, "message": "Decision recorded. Store publishing is not connected; nothing has been uploaded."}

    def insert_project(project: ProjectInput, actor: str):
        with store.connect(write=True) as db:
            try:
                db.execute("INSERT INTO projects(slug,title,category,summary,stage,created_at) VALUES(?,?,?,?,'research',?)", (project.slug, project.title, project.category, project.summary, now()))
            except sqlite3.IntegrityError:
                raise HTTPException(409, "A project with that slug already exists")
            store.audit(db, "project_created", actor, project.slug)
        return {"slug": project.slug, "repository_created": False}

    @app.post("/api/projects", status_code=201)
    def owner_project(project: ProjectInput, request: Request):
        user = session(request, write=True)
        return insert_project(project, user["user_id"])

    @app.post("/api/intake/projects", status_code=201)
    def intake_project(project: ProjectInput, request: Request):
        intake_check(request, settings)
        return insert_project(project, "intake-agent")

    @app.post("/api/intake/releases", status_code=201)
    def intake_release(manifest: Manifest, request: Request):
        intake_check(request, settings)
        payload = manifest.model_dump()
        validate_links(payload, settings)
        serialized = canonical(payload)
        manifest_hash = digest(serialized)
        release_id = "rc-" + secrets.token_hex(12)
        with store.connect(write=True) as db:
            if not db.execute("SELECT 1 FROM projects WHERE slug=?", (manifest.project_slug,)).fetchone():
                raise HTTPException(404, "Create the project before submitting a release candidate")
            existing = db.execute("SELECT id,status FROM releases WHERE manifest_hash=?", (manifest_hash,)).fetchone()
            if existing:
                return {"id": existing["id"], "status": existing["status"], "manifest_hash": manifest_hash, "idempotent": True}
            superseded = [r["id"] for r in db.execute("SELECT id FROM releases WHERE project_slug=? AND status IN ('awaiting_review','approved')", (manifest.project_slug,))]
            db.execute("UPDATE releases SET status='superseded' WHERE project_slug=? AND status IN ('awaiting_review','approved')", (manifest.project_slug,))
            db.execute("INSERT INTO releases(id,project_slug,version,manifest_json,manifest_hash,status,created_at) VALUES(?,?,?,?,?,'awaiting_review',?)", (release_id, manifest.project_slug, manifest.version, serialized, manifest_hash, now()))
            db.execute("UPDATE projects SET stage='review' WHERE slug=?", (manifest.project_slug,))
            store.audit(db, "candidate_created", "intake-agent", release_id, {"manifest_hash": manifest_hash, "superseded": superseded})
        return {"id": release_id, "manifest_hash": manifest_hash, "status": "awaiting_review", "published": False}

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app


# uvicorn dashboard.main:create_app --factory ...
