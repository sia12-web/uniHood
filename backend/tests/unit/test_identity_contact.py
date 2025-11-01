import hashlib
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.identity import hashmatch, models, policy


class ContactConnection:
    def __init__(self, handle: str, email: str, phone: str | None = None) -> None:
        self.handle = handle
        self.email = email
        self.phone = phone
        self.optin_enabled = True

    async def fetchrow(self, query: str, *params):
        q = query.strip().lower()
        if "from contact_optin" in q:
            if params[0] == "current-user":
                return {"enabled": True}
            return {"enabled": self.optin_enabled}
        if "from users" in q and "where id =" in q:
            return {
                "id": "current-user",
                "handle": "current",
                "campus_id": uuid4(),
                "email": "current@example.com",
                "email_verified": True,
            }
        raise AssertionError(f"unexpected fetchrow: {query}")

    async def fetch(self, query: str, *params):
        if "from users" in query.lower():
            return [
                {
                    "id": "target",
                    "handle": self.handle,
                    "email": self.email,
                    "email_verified": True,
                    "e164": self.phone,
                    "verified": True,
                }
            ]
        raise AssertionError(f"unexpected fetch: {query}")


class ContactPool:
    def __init__(self, conn: ContactConnection) -> None:
        self._conn = conn

    def acquire(self):
        conn = self._conn

        class _Ctx:
            async def __aenter__(self_inner):
                return conn

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Ctx()


class FlagResult:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled
        self.meta = {}


@pytest.mark.asyncio
async def test_contact_match_email(fake_redis, monkeypatch):
    user = models.User(
        id=uuid4(),
        email="current@example.com",
        email_verified=True,
        handle="current",
        display_name="Current",
        bio="",
        avatar_key=None,
        avatar_url=None,
        campus_id=uuid4(),
        privacy={},
        status={},
        password_hash="hash",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    conn = ContactConnection(handle="target-handle", email="friend@example.com")
    pool = ContactPool(conn)

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(hashmatch, "get_pool", fake_get_pool)

    async def fake_evaluate_flag(*args, **kwargs):
        return FlagResult(False)

    monkeypatch.setattr(hashmatch.flags, "evaluate_flag", fake_evaluate_flag)

    salt_response = await hashmatch.get_or_rotate_salt()
    salt = salt_response.salt
    digest = hashlib.sha256(f"friend@example.com|{salt}".encode("utf-8")).hexdigest()

    result = await hashmatch.match_hashes(user, [f"email:{digest}"])
    assert result == ["target-handle"]