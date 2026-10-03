from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    mode: str = "demo"
    base_url: str = "http://127.0.0.1:8787"
    data_dir: Path = ROOT / "var" / "demo"
    owner_github_id: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    intake_token: str = ""
    gateway_token: str = ""
    artifact_hosts: tuple[str, ...] = (
        "github.com", "testflight.apple.com", "play.google.com", "appstoreconnect.apple.com"
    )

    @property
    def live(self) -> bool:
        return self.mode == "production"

    @property
    def cookie_name(self) -> str:
        return "__Host-studio-session" if self.live else "studio-demo-session"

    @property
    def oauth_cookie(self) -> str:
        return "__Host-studio-oauth" if self.live else "studio-demo-oauth"

    def validate(self) -> None:
        if self.mode not in {"demo", "production"}:
            raise ValueError("APP_MODE must be demo or production")
        if self.gateway_token:
            import re
            if not self.live or not re.fullmatch(r"[A-Za-z0-9_-]{40,200}", self.gateway_token):
                raise ValueError("GATEWAY_TOKEN requires production mode and 40-200 URL-safe characters")
        parsed = urlsplit(self.base_url)
        if not parsed.hostname or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise ValueError("BASE_URL must be an origin, without a path or query")
        if parsed.username or parsed.password:
            raise ValueError("BASE_URL must not contain credentials")
        if self.live:
            if parsed.scheme != "https":
                raise ValueError("Production requires an HTTPS BASE_URL")
            if not self.owner_github_id.isdigit():
                raise ValueError("Set the owner's immutable numeric GitHub user ID")
            if not self.github_client_id or not self.github_client_secret:
                raise ValueError("Production requires a dedicated GitHub OAuth app")
            if len(self.intake_token) < 40:
                raise ValueError("Production requires a random intake token of at least 40 characters")
            if self.data_dir.resolve().is_relative_to(ROOT):
                raise ValueError("Production state must live outside the public repository")
        elif parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Demo mode must use a loopback HTTP origin; never publish it")

    @classmethod
    def from_env(cls) -> "Settings":
        mode = os.getenv("APP_MODE", "demo")
        default_data = Path.home() / ".local/share/sanegames-control" if mode == "production" else ROOT / "var/demo"
        return cls(
            mode=mode,
            base_url=os.getenv("BASE_URL", "https://prod.sanegames.swiftsane.com" if mode == "production" else "http://127.0.0.1:8787").rstrip("/"),
            data_dir=Path(os.getenv("STUDIO_DATA_DIR", str(default_data))).expanduser(),
            owner_github_id=os.getenv("OWNER_GITHUB_ID", ""),
            github_client_id=os.getenv("GITHUB_CLIENT_ID", ""),
            github_client_secret=os.getenv("GITHUB_CLIENT_SECRET", ""),
            intake_token=os.getenv("INTAKE_TOKEN", ""),
            gateway_token=os.getenv("GATEWAY_TOKEN", ""),
            artifact_hosts=tuple(x.strip().lower() for x in os.getenv("ARTIFACT_HOSTS", "github.com,testflight.apple.com,play.google.com,appstoreconnect.apple.com").split(",") if x.strip()),
        )
