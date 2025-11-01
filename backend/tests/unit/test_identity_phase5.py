from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from unittest.mock import AsyncMock

from app.domain.identity import interests, matching, schemas, skills


class DummyAcquire:
    def __init__(self, conn: "DummyConn") -> None:
        self._conn = conn

    async def __aenter__(self) -> "DummyConn":
        return self._conn

    async def __aexit__(self, _exc_type, _exc, _tb) -> bool:
        return False


class DummyPool:
    def __init__(self, conn: "DummyConn") -> None:
        self._conn = conn

    def acquire(self) -> DummyAcquire:
        return DummyAcquire(self._conn)


class DummyConn:
    def __init__(self) -> None:
        self.fetch_calls = 0
        self.last_fetch_query: str | None = None
        self.last_fetch_params: tuple[Any, ...] = ()
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.rows: list[dict[str, Any]] = []

    async def fetch(self, query: str, *params: Any) -> list[dict[str, Any]]:
        self.fetch_calls += 1
        self.last_fetch_query = query
        self.last_fetch_params = params
        return list(self.rows)

    async def fetchrow(self, query: str, *params: Any) -> dict[str, Any] | None:
        self.last_fetch_query = query
        self.last_fetch_params = params
        return None

    async def execute(self, query: str, *params: Any) -> None:
        self.executed.append((" ".join(query.split()), params))

    def transaction(self):
        class _Txn:
            async def __aenter__(self_inner):
                return self

            async def __aexit__(self_inner, _exc_type, _exc, _tb):
                return False

        return _Txn()


@pytest.mark.asyncio
async def test_suggest_interests_uses_cache(monkeypatch, fake_redis):
    now = datetime.now(timezone.utc)
    conn = DummyConn()
    conn.rows = [
        {
            "id": uuid4(),
            "slug": "design-system",
            "name": "Design Systems",
            "parent_id": None,
            "created_at": now,
        }
    ]
    pool = DummyPool(conn)

    async def fake_get_pool() -> DummyPool:
        return pool

    monkeypatch.setattr(interests, "get_pool", fake_get_pool)

    results_first = await interests.suggest_interests(query="des", campus_id="campus-x", limit=5)
    assert len(results_first) == 1
    assert results_first[0].slug == "design-system"
    assert conn.fetch_calls == 1

    # Second call should hit Redis cache and skip Postgres fetch
    results_second = await interests.suggest_interests(query="des", campus_id="campus-x", limit=5)
    assert len(results_second) == 1
    assert conn.fetch_calls == 1
    assert results_second[0].slug == "design-system"


@pytest.mark.asyncio
async def test_skill_upsert_normalizes_and_rebuilds(monkeypatch):
    conn = DummyConn()
    pool = DummyPool(conn)

    async def fake_get_pool() -> DummyPool:
        return pool

    monkeypatch.setattr(skills, "get_pool", fake_get_pool)
    monkeypatch.setattr(skills.policy, "enforce_skill_update_rate", AsyncMock())
    monkeypatch.setattr(skills.profile_public, "rebuild_public_profile", AsyncMock())

    sample_skill = schemas.MySkill(
        name="react",
        display="React",
        proficiency=4,
        visibility="everyone",
        added_at=datetime.now(timezone.utc),
    )
    list_mock = AsyncMock(return_value=[sample_skill])
    monkeypatch.setattr(skills, "list_user_skills", list_mock)

    payload = schemas.SkillUpsertRequest(
        name="react",
        display="React",
        proficiency=4,
        visibility="friends",
    )

    result = await skills.upsert_skill("user-123", payload)

    assert result == [sample_skill]
    assert conn.executed, "expected insert to run"
    query, params = conn.executed[0]
    assert "INSERT INTO user_skills" in query
    # Value order: user_id, name, display, proficiency, visibility
    assert params[0] == "user-123"
    assert params[1] == "react"
    assert params[3] == 4
    assert params[4] == "friends"
    skills.profile_public.rebuild_public_profile.assert_awaited_once()  # type: ignore[attr-defined]
    list_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_match_people_scores_and_sorts(monkeypatch):
    conn = DummyConn()
    user_a_id = uuid4()
    user_b_id = uuid4()
    campus_id = uuid4()
    conn.rows = [
        {
            "user_id": str(user_a_id),
            "handle": "alice",
            "display_name": "Alice",
            "avatar_key": None,
            "avatar_url": None,
            "campus_id": str(campus_id),
            "bio": "",
            "interests": ["ai-ml", "web-dev"],
            "skills": "[{\"name\": \"python\", \"display\": \"Python\", \"proficiency\": 5}]",
        },
        {
            "user_id": str(user_b_id),
            "handle": "bob",
            "display_name": "Bob",
            "avatar_key": None,
            "avatar_url": None,
            "campus_id": str(campus_id),
            "bio": "",
            "interests": ["music-performance"],
            "skills": "[{\"name\": \"guitar\", \"display\": \"Guitar\", \"proficiency\": 3}]",
        },
    ]
    pool = DummyPool(conn)

    async def fake_get_pool() -> DummyPool:
        return pool

    monkeypatch.setattr(matching, "get_pool", fake_get_pool)
    observed_calls: list[bool] = []
    monkeypatch.setattr(matching.obs_metrics, "inc_match_people_query", lambda: observed_calls.append(True))

    with pytest.raises(matching.MatchInputError):
        await matching.match_people(viewer_id="viewer", campus_id="campus-1")

    results = await matching.match_people(
        viewer_id="viewer",
        campus_id="campus-1",
        interests=["AI-ML"],
        skills=["python"],
        limit=5,
    )

    assert len(results) == 1
    assert results[0].user_id == user_a_id
    assert results[0].score >= 2.0
    assert observed_calls == [True]
# *** End of File