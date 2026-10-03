"""Production gateway contract: a tunnel must not bypass owner auth or CSRF."""
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from dashboard.cloudflare import create_app
from dashboard.settings import Settings

PUBLIC = "https://prod.sanegames.swiftsane.com"
GATEWAY = "test-only-not-a-real-gateway-secret-" + "x" * 48
INTAKE = "test-only-not-a-real-intake-secret-" + "y" * 48


@pytest.fixture
def settings(tmp_path):
    return Settings(mode="production", base_url=PUBLIC, data_dir=tmp_path / "private",
                    owner_github_id="12345", github_client_id="test-client",
                    github_client_secret="test-only", intake_token=INTAKE,
                    gateway_token=GATEWAY)


@pytest.mark.parametrize("path", ["/", "/login", "/auth/github", "/api/state", "/healthz", "/static/app.js"])
def test_origin_rejects_direct_requests_without_gateway(settings, path):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        r = client.get(path, follow_redirects=False)
        assert r.status_code == 403
        assert "x-studio-origin-mode" not in r.headers
        assert r.headers["cache-control"] == "no-store"


def test_origin_rejects_wrong_gateway_and_ignores_forwarded_identity(settings):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        r = client.get("/healthz", headers={"x-studio-gateway-token": "wrong", "x-forwarded-user": "12345"})
        assert r.status_code == 403


def test_verified_gateway_still_requires_owner_authentication(settings):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        headers = {"X-Studio-Gateway-Token": GATEWAY}
        r = client.get("/api/state", headers=headers)
        assert r.status_code == 401
        assert r.headers["x-studio-origin-mode"] == "production"
        r = client.get("/", headers=headers, follow_redirects=False)
        assert r.status_code == 303
        assert r.headers["location"] == "/login"
        assert "set-cookie" not in r.headers


def test_gateway_secret_is_not_an_intake_or_owner_credential(settings):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        headers = {"X-Studio-Gateway-Token": GATEWAY}
        project = {"slug": "test-game", "title": "Test Game", "category": "Business simulation", "summary": "A test fixture only."}
        assert client.post("/api/projects", json=project, headers=headers).status_code == 401
        assert client.post("/api/intake/projects", json=project, headers=headers).status_code == 401
        headers["Authorization"] = "Bearer " + INTAKE
        assert client.post("/api/intake/projects", json=project, headers=headers).status_code == 201


def test_gateway_proof_requires_https(settings):
    with TestClient(create_app(settings), base_url=PUBLIC.replace("https:", "http:")) as client:
        assert client.get("/healthz", headers={"X-Studio-Gateway-Token": GATEWAY}).status_code == 400


def test_gateway_secret_does_not_appear_in_response(settings):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        r = client.get("/healthz", headers={"X-Studio-Gateway-Token": GATEWAY})
        assert r.status_code == 200
        assert r.headers["x-studio-origin-mode"] == "production"
        assert GATEWAY not in r.text
        assert GATEWAY not in str(r.headers)


@pytest.mark.parametrize("token", ["short", "x" * 201, "x" * 50 + " ", "x" * 50 + "é"])
def test_invalid_gateway_secret_prevents_startup(settings, token):
    with pytest.raises(ValueError, match="GATEWAY_TOKEN"):
        replace(settings, gateway_token=token).validate()


def test_demo_with_gateway_configuration_prevents_startup(tmp_path):
    with pytest.raises(ValueError, match="GATEWAY_TOKEN"):
        Settings(data_dir=tmp_path, gateway_token=GATEWAY).validate()


def test_environment_loads_gateway_secret(monkeypatch):
    monkeypatch.setenv("GATEWAY_TOKEN", GATEWAY)
    assert Settings.from_env().gateway_token == GATEWAY


def test_gateway_factory_requires_a_secret(settings):
    with pytest.raises(ValueError, match="GATEWAY_TOKEN"):
        create_app(replace(settings, gateway_token=""))


def test_origin_rejects_duplicate_gateway_headers(settings):
    with TestClient(create_app(settings), base_url=PUBLIC) as client:
        r = client.get("/healthz", headers=[("X-Studio-Gateway-Token", GATEWAY), ("X-Studio-Gateway-Token", GATEWAY)])
        assert r.status_code == 403
