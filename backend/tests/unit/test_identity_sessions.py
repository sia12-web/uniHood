from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.domain.identity import models, risk, sessions


class RecordingConnection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []

    async def execute(self, query: str, *params: Any) -> str:
        self.executed.append((query, params))
        statement = query.strip().upper()
        if statement.startswith("UPDATE"):
            return "UPDATE 1"
        if statement.startswith("INSERT"):
            return "INSERT 0 1"
        if statement.startswith("DELETE"):
            return "DELETE 1"
        return "OK"

    async def fetchval(self, query: str, *params: Any) -> Any:
        """Mock fetchval for single value queries."""
        self.executed.append((query, params))
        # Return None for fingerprint_hash queries (no stored fingerprint in test)
        if "fingerprint_hash" in query:
            return None
        return None


class _AcquireWrapper:
    def __init__(self, conn: RecordingConnection) -> None:
        self._conn = conn

    async def __aenter__(self) -> RecordingConnection:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


class RecordingPool:
    def __init__(self, conn: RecordingConnection) -> None:
        self._conn = conn

    def acquire(self) -> _AcquireWrapper:
        return _AcquireWrapper(self._conn)


def make_user(user_id: UUID | None = None) -> models.User:
    now = datetime.now(timezone.utc)
    return models.User(
        id=user_id or uuid4(),
        email="user@example.com",
        email_verified=True,
        handle="testuser",
        display_name="Test User",
        bio="",
        avatar_key=None,
        avatar_url=None,
        campus_id=None,
        privacy={},
        status={},
        password_hash="hash",
        created_at=now,
        updated_at=now,
    )


async def _patch_pool(monkeypatch: pytest.MonkeyPatch) -> RecordingConnection:
    conn = RecordingConnection()
    pool = RecordingPool(conn)

    async def fake_get_pool() -> RecordingPool:
        return pool

    monkeypatch.setattr(sessions, "get_pool", fake_get_pool)
    return conn


@pytest.mark.asyncio
async def test_issue_session_tokens_persists_refresh_and_logs(fake_redis, monkeypatch: pytest.MonkeyPatch):
    conn = await _patch_pool(monkeypatch)
    user = make_user()

    class _Assessment:
        score = 10
        reasons: list[str] = []
        step_up_required = False
        blocked = False

    async def fake_evaluate_login(user_obj, session_id, *, ip, user_agent, geo=None):
        return _Assessment()

    monkeypatch.setattr(risk, "evaluate_login", fake_evaluate_login)

    result = await sessions.issue_session_tokens(
        user,
        ip="203.0.113.1",
        user_agent="pytest",
        device_label="Laptop",
    )

    assert result.user_id == user.id
    assert result.session_id is not None
    commands = [statement for statement, _ in conn.executed]
    assert any("INSERT INTO sessions" in command for command in commands)

    stored_refresh = await fake_redis.get(f"session:refresh:{result.session_id}")
    # Since refresh tokens are now stored as hashes, ensure it's not the raw token
    assert stored_refresh is not None and stored_refresh != result.refresh_token

    events = await fake_redis.xrange("x:identity.events", count=1)
    assert events and events[0][1]["event"] == "session_created"


@pytest.mark.asyncio
async def test_refresh_session_rotates_token(fake_redis, monkeypatch: pytest.MonkeyPatch):
    await _patch_pool(monkeypatch)
    user = make_user()

    session_id = uuid4()
    old_refresh = "old-refresh-token"
    # Pre-store the hash to simulate existing session state
    import hmac
    import hashlib
    token_hash = hmac.new(
        sessions.REFRESH_PEPPER.encode(),
        old_refresh.encode(),
        hashlib.sha256
    ).hexdigest()
    await fake_redis.set(f"session:refresh:{session_id}", token_hash, ex=60)

    # Mock eval for rotation
    async def mock_eval(*args, **kwargs):
        return 0
    monkeypatch.setattr(fake_redis, "eval", mock_eval)

    result = await sessions.refresh_session(
        user,
        session_id=session_id,
        refresh_token=old_refresh,
        ip="203.0.113.45",
        user_agent="pytest-refresh",
    )

    assert result.session_id == session_id
    assert result.refresh_token != old_refresh
    # New stored value should be a hash, not the raw token
    new_stored = await fake_redis.get(f"session:refresh:{session_id}")
    assert new_stored is not None and new_stored != result.refresh_token


@pytest.mark.asyncio
async def test_revoke_session_clears_refresh(fake_redis, monkeypatch: pytest.MonkeyPatch):
    conn = await _patch_pool(monkeypatch)
    session_id = uuid4()
    await fake_redis.set(f"session:refresh:{session_id}", "token", ex=60)

    await sessions.revoke_session("user-1", session_id)

    assert await fake_redis.get(f"session:refresh:{session_id}") is None
    commands = [statement for statement, _ in conn.executed]
    assert any("UPDATE sessions" in command for command in commands)

    events = await fake_redis.xrange("x:identity.events", count=1)
    assert events and events[0][1]["event"] == "session_revoked"
