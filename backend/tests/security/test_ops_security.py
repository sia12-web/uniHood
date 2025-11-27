import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from app.api import ops
from app.settings import Settings
from app.main import app

# We need to override settings to test the "no token configured" case
def test_ops_endpoints_fail_closed_without_token(monkeypatch):
    # Mock settings to have NO admin token
    monkeypatch.setenv("OBS_ADMIN_TOKEN", "")
    
    # Re-import or re-initialize might be needed if settings are cached, 
    # but usually monkeypatching env before app startup or dependency resolution works 
    # if the dependency reads settings dynamically. 
    # However, app.settings.settings is instantiated at module level.
    # Let's try to patch the settings object directly if possible, or the dependency.
    
    from app import settings
    monkeypatch.setattr(settings.settings, "obs_admin_token", None)

    client = TestClient(app)

    # Try to access a protected endpoint
    # /health/full does not exist in ops.py, but /ops/trace/test does and requires admin
    response = client.post("/ops/trace/test", headers={"X-Admin-Token": "whatever"})
    
    # Should be 403 Forbidden because no token is configured on server side
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "admin_token_not_configured"

def test_ops_endpoints_work_with_correct_token(monkeypatch):
    from app import settings
    monkeypatch.setattr(settings.settings, "obs_admin_token", "secret-token")
    # Ensure environment is NOT prod so the endpoint doesn't 403 for that reason
    monkeypatch.setattr(settings.settings, "environment", "dev")

    client = TestClient(app)

    # Correct token
    response = client.post("/ops/trace/test", headers={"X-Admin-Token": "secret-token"})
    
    # If successful, it returns 200 or 500 (if tracing fails) but NOT 403/404
    assert response.status_code != 403
    assert response.status_code != 404

def test_ops_endpoints_reject_wrong_token(monkeypatch):
    from app import settings
    monkeypatch.setattr(settings.settings, "obs_admin_token", "secret-token")

    client = TestClient(app)

    # Wrong token
    response = client.post("/ops/trace/test", headers={"X-Admin-Token": "wrong-token"})
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "forbidden"
