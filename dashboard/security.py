from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse

from .settings import Settings
from .store import Store, digest

MAX_BODY = 65536


class BodyLimitMiddleware:
    """Bound request bodies before handing them to JSON validation, including chunked bodies."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_BODY:
                response = JSONResponse({"detail": "Request body exceeds 64 KiB"}, status_code=413)
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        delivered = False

        async def limited_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        return await self.app(scope, limited_receive, send)


class RateLimiter:
    """Single-process, bounded fallback. Add reverse-proxy limits before a public launch."""
    def __init__(self):
        self.events: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, limit: int) -> bool:
        t = time.monotonic()
        if len(self.events) > 10000:
            self.events = defaultdict(deque, {k: v for k, v in self.events.items() if v and v[-1] > t-60})
            if len(self.events) > 10000 and key not in self.events:
                return False
        events = self.events[key]
        while events and events[0] <= t - 60:
            events.popleft()
        if len(events) >= limit:
            return False
        events.append(t)
        return True


def owner_session(request: Request, settings: Settings, store: Store) -> dict:
    token = request.cookies.get(settings.cookie_name, "")
    with store.connect() as db:
        row = db.execute("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?", (digest(token), int(time.time()))).fetchone()
    expected = settings.owner_github_id if settings.live else "demo-owner"
    if not row or row["user_id"] != expected:
        raise HTTPException(401, "Owner sign-in required")
    return dict(row)


def csrf_check(request: Request, session: dict, settings: Settings) -> None:
    if request.headers.get("origin") != settings.base_url:
        raise HTTPException(403, "Origin check failed")
    if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), session["csrf"]):
        raise HTTPException(403, "CSRF check failed")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Cross-site writes are not allowed")


def intake_check(request: Request, settings: Settings) -> None:
    if not settings.live or not settings.intake_token:
        raise HTTPException(403, "Agent intake is disabled in demo mode")
    provided = request.headers.get("authorization", "")
    if not secrets.compare_digest(provided, "Bearer " + settings.intake_token):
        raise HTTPException(401, "Valid intake credentials required")
    # Human browser credentials and machine credentials are separate, never interchangeable.
    if request.cookies.get(settings.cookie_name):
        raise HTTPException(403, "Use the dedicated machine intake client")


def validate_links(manifest: dict, settings: Settings) -> None:
    for item in manifest["artifacts"] + manifest["evidence"]:
        parsed = urlsplit(item["url"])
        if parsed.scheme != "https" or parsed.hostname not in settings.artifact_hosts:
            raise HTTPException(422, "Build and evidence URLs must use an allowlisted HTTPS host")
        if parsed.username or parsed.password or parsed.fragment or parsed.query:
            raise HTTPException(422, "Do not include credentials, fragments, or signed query tokens in evidence URLs")
        try:
            if parsed.port not in {None, 443}:
                raise HTTPException(422, "Evidence links must use HTTPS port 443")
        except ValueError:
            raise HTTPException(422, "Invalid evidence URL port")


def verify_owner_profile(profile: dict, settings: Settings) -> None:
    if str(profile.get("id", "")) != settings.owner_github_id:
        raise HTTPException(403, "This GitHub account is not the authorized owner")
    if profile.get("two_factor_authentication") is not True:
        raise HTTPException(403, "GitHub two-factor authentication must be enabled and verifiable")
