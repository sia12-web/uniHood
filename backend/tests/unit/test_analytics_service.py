
import pytest
import json
from unittest.mock import MagicMock
from app.domain.analytics.service import AnalyticsService

# Stub classes similar to test_phase_b_hardening.py
class StubAcquire:
    def __init__(self, conn):
        self._conn = conn
    async def __aenter__(self):
        return self._conn
    async def __aexit__(self, exc_type, exc, tb):
        pass

class StubConnection:
    def __init__(self):
        self.fetch_queries = []
        self.fetchval_rets = []
        self.fetch_rets = []

    async def fetch(self, query: str, *args):
        self.fetch_queries.append(query)
        if self.fetch_rets:
            return self.fetch_rets.pop(0)
        return []

    async def fetchval(self, query: str, *args):
        self.fetch_queries.append(query)
        if self.fetchval_rets:
            return self.fetchval_rets.pop(0)
        return 0

class StubPool:
    def __init__(self, conn: StubConnection):
        self._conn = conn
    def acquire(self):
        return StubAcquire(self._conn)

@pytest.mark.asyncio
async def test_get_overview(monkeypatch):
    conn = StubConnection()
    pool = StubPool(conn)
    async def mock_get_pool(self):
        return pool
    monkeypatch.setattr(AnalyticsService, "_get_pool", mock_get_pool)
    
    # Order of fetchval calls in service: meetups, games, active_meetups, active_games
    conn.fetchval_rets = [10, 20, 5, 2] 

    svc = AnalyticsService()
    overview = await svc.get_overview()

    assert overview.total_meetups_created == 10
    assert overview.total_games_played == 20
    assert overview.active_meetups_count == 5
    assert overview.active_games_count == 2
    assert len(conn.fetch_queries) == 4

@pytest.mark.asyncio
async def test_get_popular_games(monkeypatch):
    conn = StubConnection()
    pool = StubPool(conn)
    async def mock_get_pool(self):
        return pool
    monkeypatch.setattr(AnalyticsService, "_get_pool", mock_get_pool)

    # Mock return rows
    conn.fetch_rets = [[
        {"kind": "chess", "play_count": 50, "last_played": None},
        {"kind": "typing", "play_count": 30, "last_played": None}
    ]]

    svc = AnalyticsService()
    games = await svc.get_popular_games(limit=2)

    assert len(games) == 2
    assert games[0].game_kind == "chess"
    assert games[0].play_count == 50
    assert games[1].game_kind == "typing"
    assert "SELECT kind, COUNT(*)" in conn.fetch_queries[0]

@pytest.mark.asyncio
async def test_get_popular_meetup_types(monkeypatch):
    conn = StubConnection()
    pool = StubPool(conn)
    async def mock_get_pool(self):
        return pool
    monkeypatch.setattr(AnalyticsService, "_get_pool", mock_get_pool)

    conn.fetch_rets = [[
        {"category": "study", "count": 12},
        {"category": "sports", "count": 8}
    ]]

    svc = AnalyticsService()
    types = await svc.get_popular_meetup_types()

    assert len(types) == 2
    assert types[0].category == "study"
    assert types[0].count == 12

@pytest.mark.asyncio
async def test_get_recent_activity(monkeypatch):
    conn = StubConnection()
    pool = StubPool(conn)
    async def mock_get_pool(self):
        return pool
    monkeypatch.setattr(AnalyticsService, "_get_pool", mock_get_pool)

    import datetime
    now = datetime.datetime.now()

    conn.fetch_rets = [[
        {
            "id": 101,
            "user_id": "u1",
            "event": "meetup.create",
            "meta": json.dumps({"title": "Test"}), 
            "created_at": now,
            "display_name": "Alice",
            "avatar_url": None,
            "handle": "alice",
            "likes_count": 0,
            "is_liked": False
        },
        {
            "id": 100,
            "user_id": "u2",
            "event": "game.play",
            "meta": {}, # dict in older rows potentially, ensuring code handles str
            "created_at": now,
            "display_name": None,
            "avatar_url": "http://img",
            "handle": "bob",
            "likes_count": 5,
            "is_liked": True
        }
    ]]

    svc = AnalyticsService()
    logs = await svc.get_recent_activity()

    assert len(logs) == 2
    assert logs[0].event == "meetup.create"
    assert logs[0].meta["title"] == "Test"
    assert logs[0].user_display_name == "Alice"
    
    assert logs[1].user_display_name == "bob" # fallback to handle if display_name is None
    assert logs[1].user_avatar_url == "http://img"
