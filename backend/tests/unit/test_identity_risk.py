from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.domain.identity import models, risk


class StaticConnection:
    def __init__(self, trust_level: int = 1, known_device: bool = True) -> None:
        self.trust_level = trust_level
        self.known_device = known_device
        self.executed: list[tuple[str, tuple[object, ...]]] = []

    async def fetchrow(self, query: str, *params):
        query = query.strip().lower()
        if "from trust_profiles" in query:
            return {"trust_level": self.trust_level}
        if "from trusted_devices" in query:
            return {"exists": 1} if self.known_device else None
        raise AssertionError(f"Unexpected query: {query}")

    async def execute(self, query: str, *params):
        self.executed.append((" ".join(query.split()), params))
        return "EXECUTE 1"


class StaticPool:
    def __init__(self, conn: StaticConnection) -> None:
        self._conn = conn

    def acquire(self):
        conn = self._conn

        class _Ctx:
            async def __aenter__(self_inner):
                return conn

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Ctx()


def make_user() -> models.User:
    now = datetime.now(timezone.utc)
    return models.User(
        id=uuid4(),
        email="user@example.com",
        email_verified=True,
        handle="riskuser",
        display_name="Risk User",
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


@pytest.mark.asyncio
async def test_low_risk_login(fake_redis, monkeypatch):
    user = make_user()
    conn = StaticConnection(trust_level=2, known_device=True)
    pool = StaticPool(conn)

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(risk, "get_pool", fake_get_pool)

    assessment = await risk.evaluate_login(
        user,
        session_id=uuid4(),
        ip="203.0.113.1",
        user_agent="Mozilla/5.0 (Windows)",
        geo={"city": "Boston", "country": "US", "lat": 42.36, "lon": -71.05},
    )

    assert assessment.score < 30
    assert assessment.blocked is False
    assert assessment.step_up_required is False


@pytest.mark.asyncio
async def test_high_risk_geo_change(fake_redis, monkeypatch):
    user = make_user()
    # first login to seed geo/ua
    base_conn = StaticConnection(trust_level=0, known_device=False)
    base_pool = StaticPool(base_conn)

    async def fake_pool_first():
        return base_pool

    monkeypatch.setattr(risk, "get_pool", fake_pool_first)

    await risk.evaluate_login(
        user,
        session_id=uuid4(),
        ip="203.0.113.5",
        user_agent="Mozilla/5.0 (Macintosh)",
        geo={"city": "Paris", "country": "FR", "lat": 48.85, "lon": 2.35, "ts": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()},
    )

    # second login from distant location should trigger high score
    async def fake_pool_second():
        return StaticPool(StaticConnection(trust_level=0, known_device=False))

    monkeypatch.setattr(risk, "get_pool", fake_pool_second)

    assessment = await risk.evaluate_login(
        user,
        session_id=uuid4(),
        ip="198.51.100.10",
        user_agent="Mozilla/5.0 (Windows)",
        geo={"city": "Sydney", "country": "AU", "lat": -33.86, "lon": 151.21, "ts": datetime.now(timezone.utc).isoformat()},
    )

    assert assessment.score >= 60
    assert assessment.step_up_required is True
