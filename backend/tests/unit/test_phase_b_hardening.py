from __future__ import annotations

import pytest

from app.infra.soft_delete import soft_delete
from app.maintenance import retention


class StubAcquire:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class StubConnection:
    def __init__(self):
        self.fetch_queries: list[str] = []
        self.execute_calls: list[tuple[str, object]] = []

    async def fetch(self, query: str):
        self.fetch_queries.append(query)
        if "FROM messages" in query:
            return [1, 2, 3]
        if "FROM sessions" in query:
            return [1]
        if "FROM invitations" in query:
            return []
        raise AssertionError(f"unexpected query: {query}")

    async def execute(self, query: str, param: object):
        self.execute_calls.append((query, param))
        return "UPDATE 1"


class StubPool:
    def __init__(self, conn: StubConnection):
        self._conn = conn

    def acquire(self):
        return StubAcquire(self._conn)


@pytest.mark.asyncio
async def test_purge_soft_deleted_aggregates_counts(monkeypatch):
    conn = StubConnection()
    pool = StubPool(conn)

    async def _get_pool():
        return pool

    monkeypatch.setattr(retention, "get_pool", _get_pool)

    counts = await retention.purge_soft_deleted(batch=50)

    assert counts == {"messages": 3, "sessions": 1, "invitations": 0}
    assert any("LIMIT 50" in q for q in conn.fetch_queries)
    message_query = next(q for q in conn.fetch_queries if "FROM messages" in q)
    assert f"INTERVAL '{retention.MESSAGES_RETENTION_DAYS} days'" in message_query
    session_query = next(q for q in conn.fetch_queries if "FROM sessions" in q)
    assert f"INTERVAL '{retention.SESSIONS_RETENTION_DAYS} days'" in session_query
    invite_query = next(q for q in conn.fetch_queries if "FROM invitations" in q)
    assert f"INTERVAL '{retention.INVITES_RETENTION_DAYS} days'" in invite_query


@pytest.mark.asyncio
async def test_soft_delete_updates_deleted_at_guarded():
    conn = StubConnection()
    await soft_delete(conn, "users", "id", row_id="user-1")

    assert conn.execute_calls
    query, param = conn.execute_calls[-1]
    assert param == "user-1"
    assert "UPDATE users SET deleted_at = NOW()" in query
    assert "WHERE id = $1" in query
    assert "deleted_at IS NULL" in query
