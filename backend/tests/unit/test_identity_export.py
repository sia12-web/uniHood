from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.domain.identity import export
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client


async def _noop(*_args, **_kwargs) -> None:
    return None


@pytest.mark.asyncio
async def test_request_export_creates_pending_job(monkeypatch):
    auth_user = AuthenticatedUser(id="user-export", campus_id="campus-1")
    monkeypatch.setattr(export.policy, "enforce_export_request_rate", _noop)
    append_event = AsyncMock()
    log_event = AsyncMock()
    monkeypatch.setattr(export.audit, "append_db_event", append_event)
    monkeypatch.setattr(export.audit, "log_event", log_event)
    metric_calls: list[bool] = []
    monkeypatch.setattr(export.obs_metrics, "inc_identity_export_request", lambda: metric_calls.append(True))

    status = await export.request_export(auth_user)

    assert status.status == "pending"
    cached = await redis_client.get("export:job:user-export")
    assert cached is not None
    assert metric_calls == [True]
    append_event.assert_awaited_once()
    log_event.assert_awaited_once()

    # requesting again returns existing job without duplicating audit events
    append_event.reset_mock()
    log_event.reset_mock()
    second = await export.request_export(auth_user)

    assert second.status == "pending"
    assert second.requested_at == status.requested_at
    append_event.assert_not_called()
    log_event.assert_not_called()


@pytest.mark.asyncio
async def test_mark_ready_sets_download_url(monkeypatch):
    auth_user = AuthenticatedUser(id="user-export-ready", campus_id="campus-2")
    monkeypatch.setattr(export.policy, "enforce_export_request_rate", _noop)
    monkeypatch.setattr(export.obs_metrics, "inc_identity_export_request", lambda: None)
    monkeypatch.setattr(export.audit, "append_db_event", AsyncMock())
    monkeypatch.setattr(export.audit, "log_event", AsyncMock())

    await export.request_export(auth_user)

    append_event = AsyncMock()
    log_event = AsyncMock()
    monkeypatch.setattr(export.audit, "append_db_event", append_event)
    monkeypatch.setattr(export.audit, "log_event", log_event)

    status = await export.mark_ready(auth_user.id, download_path="exports/user-export-ready/archive.zip")

    assert status is not None
    assert status.status == "ready"
    assert status.download_url is not None
    url = str(status.download_url)
    assert url.endswith("archive.zip")
    append_event.assert_awaited_once()
    log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_clear_job_removes_export_state(monkeypatch):
    auth_user = AuthenticatedUser(id="user-export-clear", campus_id="campus-3")
    monkeypatch.setattr(export.policy, "enforce_export_request_rate", _noop)
    monkeypatch.setattr(export.obs_metrics, "inc_identity_export_request", lambda: None)
    monkeypatch.setattr(export.audit, "append_db_event", AsyncMock())
    monkeypatch.setattr(export.audit, "log_event", AsyncMock())

    await export.request_export(auth_user)
    assert await export.get_status(auth_user.id) is not None

    await export.clear_job(auth_user.id)
    assert await export.get_status(auth_user.id) is None
