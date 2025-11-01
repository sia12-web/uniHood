import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.identity import audit, models, phone_verify, sms


async def _noop_async(*_args, **_kwargs):
    return None


class DummyConnection:
    def __init__(self) -> None:
        self.phones_by_user: dict[str, dict[str, object]] = {}
        self.phones_by_number: dict[str, str] = {}

    async def fetchrow(self, query: str, *params):
        query = query.strip()
        if "SELECT user_id FROM user_phones" in query and "WHERE e164" in query:
            number = params[0]
            owner = self.phones_by_number.get(number)
            if owner:
                return {"user_id": owner}
            return None
        if "SELECT * FROM user_phones WHERE user_id" in query:
            user_id = params[0]
            record = self.phones_by_user.get(user_id)
            if not record:
                return None
            return record
        raise AssertionError(f"unexpected fetchrow: {query}")

    async def execute(self, query: str, *params):
        q = query.strip().upper()
        if q.startswith("INSERT INTO USER_PHONES"):
            user_id, number = params[0], params[1]
            record = {
                "user_id": user_id,
                "e164": number,
                "verified": False,
                "verified_at": None,
                "created_at": datetime.now(timezone.utc),
            }
            self.phones_by_user[user_id] = record
            self.phones_by_number[number] = user_id
            return "INSERT 0 1"
        if q.startswith("UPDATE USER_PHONES"):
            user_id = params[0]
            record = self.phones_by_user.get(user_id)
            if record:
                record["verified"] = True
                record["verified_at"] = datetime.now(timezone.utc)
                return "UPDATE 1"
            return "UPDATE 0"
        if q.startswith("DELETE FROM USER_PHONES"):
            user_id = params[0]
            record = self.phones_by_user.pop(user_id, None)
            if record:
                self.phones_by_number.pop(record["e164"], None)
            return "DELETE 1"
        raise AssertionError(f"unexpected execute: {query}")

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


@pytest.mark.asyncio
async def test_phone_request_and_verify(fake_redis, monkeypatch):
    user = models.User(
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
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    conn = DummyConnection()
    pool = DummyPool(conn)

    async def fake_get_pool():
        return pool

    monkeypatch.setattr(phone_verify, "get_pool", fake_get_pool)
    monkeypatch.setattr(sms, "generate_otp", lambda: "123456")
    monkeypatch.setattr(audit, "log_event", _noop_async, raising=False)

    class _StubPhone:
        def __init__(self, user_id, e164, verified, verified_at, created_at):
            self.user_id = user_id
            self.e164 = e164
            self.verified = verified
            self.verified_at = verified_at
            self.created_at = created_at

        @classmethod
        def from_record(cls, record):
            return cls(
                record["user_id"],
                record["e164"],
                record.get("verified", False),
                record.get("verified_at"),
                record["created_at"],
            )

    monkeypatch.setattr(models, "UserPhone", _StubPhone, raising=False)

    await phone_verify.request_code(user, "+14155551234")

    pending = await fake_redis.get("otp:sms:{}".format(user.id))
    assert pending is not None
    payload = json.loads(pending)
    assert payload["code"] == "123456"

    phone = await phone_verify.verify_code(str(user.id), "123456")
    assert phone.verified is True
    assert phone.e164 == "+14155551234"

    # removal clears stored entries
    await phone_verify.remove_phone(str(user.id))
    assert await fake_redis.get("otp:sms:{}".format(user.id)) is None
