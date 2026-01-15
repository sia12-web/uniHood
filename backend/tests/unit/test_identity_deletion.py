from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.domain.identity import deletion
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client


class DummyTransaction:
    async def __aenter__(self) -> "DummyTransaction":
        return self

    async def __aexit__(self, _exc_type, _exc, _tb) -> bool:
        return False


class DummyAcquire:
    def __init__(self, conn: "DummyConnection") -> None:
        self._conn = conn

    async def __aenter__(self) -> "DummyConnection":
        return self._conn

    async def __aexit__(self, _exc_type, _exc, _tb) -> bool:
        return False


class DummyConnection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.last_status: dict[str, Any] | None = None

    async def execute(self, query: str, *params: Any) -> None:
        self.executed.append((query.strip(), params))
        normalized = " ".join(query.lower().split())
        if "insert into account_deletions" in normalized and "confirmed_at" not in normalized:
            requested_at = params[1]
            self.last_status = {
                "user_id": params[0],
                "requested_at": requested_at,
                "confirmed_at": None,
                "purged_at": None,
            }
        elif "insert into account_deletions" in normalized and "confirmed_at" in normalized:
            now = datetime.now(timezone.utc)
            if not self.last_status:
                self.last_status = {
                    "user_id": params[0],
                    "requested_at": now,
                    "confirmed_at": now,
                    "purged_at": None,
                }
            else:
                self.last_status["confirmed_at"] = now
                self.last_status.setdefault("requested_at", now)
        elif "update account_deletions" in normalized and "purged_at" in normalized and self.last_status:
            self.last_status["purged_at"] = datetime.now(timezone.utc)

    async def fetchrow(self, query: str, *params: Any) -> dict[str, Any] | None:
        if "select requested_at" in query.lower():
            if not self.last_status or self.last_status["user_id"] != params[0]:
                return None
            return {
                "requested_at": self.last_status["requested_at"],
                "confirmed_at": self.last_status.get("confirmed_at"),
                "purged_at": self.last_status.get("purged_at"),
            }
        return None

    def transaction(self) -> DummyTransaction:
        return DummyTransaction()


class DummyPool:
    def __init__(self, conn: DummyConnection) -> None:
        self._conn = conn

    def acquire(self) -> DummyAcquire:
        return DummyAcquire(self._conn)


async def _noop(*_args, **_kwargs) -> None:
    return None


@pytest.mark.asyncio
async def test_request_deletion_records_status(monkeypatch):
    auth_user = AuthenticatedUser(id="user-delete", campus_id="campus-1")
    conn = DummyConnection()
    pool = DummyPool(conn)

    async def fake_get_pool() -> DummyPool:
        return pool

    monkeypatch.setattr(deletion, "get_pool", fake_get_pool)
    monkeypatch.setattr(deletion.policy, "enforce_deletion_request_rate", _noop)
    load_user = AsyncMock(return_value={"email": "user@example.com", "handle": "demo"})
    monkeypatch.setattr(deletion, "_load_user", load_user)
    send_mail = AsyncMock()
    monkeypatch.setattr(deletion.mailer, "send_deletion_confirmation", send_mail)
    log_event = AsyncMock()
    monkeypatch.setattr(deletion.audit, "log_event", log_event)
    monkeypatch.setattr(deletion.obs_metrics, "inc_identity_delete_request", lambda: None)

    status = await deletion.request_deletion(auth_user)

    assert status.requested_at == conn.last_status["requested_at"]
    assert await redis_client.get("delete:confirm:user-delete") is not None
    load_user.assert_awaited_once()
    send_mail.assert_awaited_once()
    log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_deletion_revokes_sessions_and_clears_token(monkeypatch):
    auth_user = AuthenticatedUser(id="user-delete-confirm", campus_id="campus-2")
    conn = DummyConnection()
    pool = DummyPool(conn)

    async def fake_get_pool() -> DummyPool:
        return pool

    monkeypatch.setattr(deletion, "get_pool", fake_get_pool)
    monkeypatch.setattr(deletion.policy, "enforce_deletion_request_rate", _noop)
    load_user = AsyncMock(return_value={"email": "user@example.com", "handle": "demo"})
    monkeypatch.setattr(deletion, "_load_user", load_user)
    send_mail = AsyncMock()
    monkeypatch.setattr(deletion.mailer, "send_deletion_confirmation", send_mail)
    log_event = AsyncMock()
    monkeypatch.setattr(deletion.audit, "log_event", log_event)
    monkeypatch.setattr(deletion.obs_metrics, "inc_identity_delete_request", lambda: None)
    confirm_metrics: list[bool] = []
    monkeypatch.setattr(deletion.obs_metrics, "inc_identity_delete_confirm", lambda: confirm_metrics.append(True))
    revoke_sessions = AsyncMock()
    monkeypatch.setattr(deletion.sessions, "revoke_all_sessions", revoke_sessions)
    generated_handle = AsyncMock(return_value="deleted-deadbeef")
    monkeypatch.setattr(deletion, "_generate_deleted_handle", generated_handle)

    await deletion.request_deletion(auth_user)
    token = await redis_client.get("delete:confirm:user-delete-confirm")
    assert token is not None

    log_event.reset_mock()
    send_mail.reset_mock()

    status = await deletion.confirm_deletion(auth_user, token)

    assert status.requested_at is not None
    assert status.confirmed_at is not None
    assert await redis_client.get("delete:confirm:user-delete-confirm") is None
    revoke_sessions.assert_awaited_once_with(auth_user.id)
    assert confirm_metrics == [True]
    log_event.assert_awaited_once()
    # Verify that a delete from users was part of the transaction
    assert any("delete from users" in query.lower() for query, _ in conn.executed)

