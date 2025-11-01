from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.identity import audit, linking, models


class DummyConnection:
    def __init__(self) -> None:
        self.identities: dict[tuple[str, str], dict[str, object]] = {}
        self.password_hash = "hash"
        self.passkeys = 1

    def _upsert_identity(self, provider: str, subject: str, user_id: str, email: str | None) -> dict[str, object]:
        entry = self.identities.get((provider, subject))
        if entry:
            entry["user_id"] = user_id
            entry["email"] = email
            entry.setdefault("id", uuid4())
            entry.setdefault("created_at", datetime.now(timezone.utc))
            entry["provider"] = provider
            entry["subject"] = subject
            return entry
        new_entry = {
            "id": uuid4(),
            "user_id": user_id,
            "provider": provider,
            "subject": subject,
            "email": email,
            "created_at": datetime.now(timezone.utc),
        }
        self.identities[(provider, subject)] = new_entry
        return new_entry

    async def fetchrow(self, query: str, *params):
        q = query.strip().lower()
        if q.startswith("insert into oauth_identities"):
            return self._upsert_identity(params[2], params[3], params[1], params[4])
        if "from oauth_identities" in q and "for update" in q:
            user_id, provider = params[0], params[1]
            for (prov, subject), entry in self.identities.items():
                if entry["user_id"] == user_id and prov == provider:
                    return {
                        "id": entry.get("id", uuid4()),
                        "provider": prov,
                        "subject": subject,
                    }
            return None
        if "from oauth_identities" in q and "provider =" in q and "subject" in q:
            provider, subject = params[0], params[1]
            entry = self.identities.get((provider, subject))
            if entry:
                return {"user_id": entry["user_id"]}
            return None
        if "from oauth_identities" in q and "user_id" in q:
            provider = params[1]
            for key, value in self.identities.items():
                if value["user_id"] == params[0] and key[0] == provider:
                    return {
                        "id": value.get("id", uuid4()),
                        "provider": provider,
                        "subject": key[1],
                    }
            return None
        if "from users" in q and "password_hash" in q:
            return {"password_hash": self.password_hash}
        return None

    async def fetchval(self, query: str, *params):
        q = query.strip().lower()
        if "count(*)" in q and "oauth_identities" in q:
            return sum(1 for value in self.identities.values() if value["user_id"] == params[0])
        if "count(*)" in q and "authenticators" in q:
            return self.passkeys
        return 0

    async def execute(self, query: str, *params):
        q = query.strip().lower()
        if q.startswith("insert into oauth_identities"):
            self._upsert_identity(params[2], params[3], params[1], params[4])
            return "INSERT 0 1"
        if q.startswith("delete from oauth_identities"):
            provider = params[1]
            for key in list(self.identities.keys()):
                if self.identities[key]["user_id"] == params[0] and key[0] == provider:
                    self.identities.pop(key)
            return "DELETE 1"
        return "OK"

    def transaction(self):
        conn = self

        class _Txn:
            async def __aenter__(self_inner):
                return conn

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Txn()


class DummyPool:
    def __init__(self, conn: DummyConnection) -> None:
        self._conn = conn

    def acquire(self):
        conn = self._conn

        class _Ctx:
            async def __aenter__(self_inner):
                return conn

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Ctx()


async def _noop_async(*_args, **_kwargs):
    return None


def make_user() -> models.User:
    now = datetime.now(timezone.utc)
    return models.User(
        id=uuid4(),
        email="user@example.com",
        email_verified=True,
        handle="tester",
        display_name="Tester",
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
async def test_complete_link_inserts_identity(monkeypatch):
    user = make_user()
    conn = DummyConnection()
    pool = DummyPool(conn)

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(linking, "get_pool", fake_get_pool)
    monkeypatch.setattr(audit, "log_event", _noop_async)

    result = await linking.complete_link(user, provider="google", subject="sub", email="user@google.com")
    assert result.provider == "google"
    assert ("google", "sub") in conn.identities


@pytest.mark.asyncio
async def test_unlink_requires_additional_method(monkeypatch):
    user = make_user()
    conn = DummyConnection()
    conn._upsert_identity("google", "abc", str(user.id), "user@google.com")
    conn.passkeys = 0
    conn.password_hash = ""
    pool = DummyPool(conn)

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(linking, "get_pool", fake_get_pool)
    monkeypatch.setattr(audit, "log_event", _noop_async)

    with pytest.raises(linking.policy.IdentityPolicyError) as exc:
        await linking.unlink_identity(str(user.id), "google")
    assert exc.value.reason == "link_last_method"
