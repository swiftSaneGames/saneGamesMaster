"""Gateway-only ASGI entrypoint; original local/reverse-proxy app stays unchanged."""
from __future__ import annotations

import secrets

from starlette.responses import JSONResponse

from .main import create_app as create_dashboard_app
from .settings import Settings


class GatewayMiddleware:
    def __init__(self, app, token: str):
        self.app = app
        self.token = token.encode("ascii")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        # Duplicate credentials fail closed instead of choosing an ambiguous value.
        tokens = [v for k, v in scope.get("headers", []) if k.lower() == b"x-studio-gateway-token"]
        if len(tokens) != 1 or not secrets.compare_digest(tokens[0], self.token):
            response = JSONResponse({"detail": "Valid gateway credentials required"}, status_code=403,
                                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
            return await response(scope, receive, send)

        async def verified_send(message):
            if message["type"] == "http.response.start":
                message = dict(message)
                headers = [(k, v) for k, v in message.get("headers", [])
                           if k.lower() not in {b"x-studio-origin-mode", b"x-studio-gateway-token"}]
                message["headers"] = headers + [(b"x-studio-origin-mode", b"production")]
            await send(message)

        return await self.app(scope, receive, verified_send)


def create_app(settings: Settings | None = None):
    settings = settings or Settings.from_env()
    settings.validate()
    if not settings.live or not settings.gateway_token:
        raise ValueError("Cloudflare origin requires production mode and GATEWAY_TOKEN")
    app = create_dashboard_app(settings)
    app.add_middleware(GatewayMiddleware, token=settings.gateway_token)
    return app
