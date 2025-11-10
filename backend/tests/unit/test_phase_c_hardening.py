from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.api.pagination import encode_cursor
from app.domain.chat.schemas import MessageListResponse, MessageResponse
from app.domain.social.schemas import InviteSummary
from app.infra.idempotency import IdempotencyConflictError


@pytest.fixture
def idempotency_stub(monkeypatch):
    store: dict[tuple[str, str], dict[str, str | None]] = {}

    async def begin(key: str, handler: str, *, payload_hash: str | None) -> dict[str, str] | None:
        entry = store.get((key, handler))
        if entry is None:
            store[(key, handler)] = {"payload_hash": payload_hash, "result_id": None}
            return None
        existing_hash = entry.get("payload_hash")
        if existing_hash is not None and payload_hash is not None and existing_hash != payload_hash:
            raise IdempotencyConflictError()
        result_id = entry.get("result_id")
        if result_id is None:
            return None
        return {"result_id": result_id}

    async def complete(key: str, handler: str, result_id: str) -> None:
        entry = store.setdefault((key, handler), {"payload_hash": None, "result_id": None})
        entry["result_id"] = result_id

    monkeypatch.setattr("app.infra.idempotency.begin", begin)
    monkeypatch.setattr("app.infra.idempotency.complete", complete)
    return store


@pytest.mark.asyncio
async def test_invite_send_idempotency_returns_same_summary(api_client, monkeypatch, idempotency_stub):
    user_id = str(uuid4())
    campus_id = str(uuid4())
    peer_id = uuid4()
    invite_id = uuid4()
    now = datetime.now(timezone.utc)
    summary = InviteSummary(
        id=invite_id,
        from_user_id=UUID(user_id),
        to_user_id=peer_id,
        status="sent",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=7),
    )

    async def fake_send_invite(auth_user, to_user_id, campus_id):
        return summary

    async def fake_get_invite_summary(result_id):
        assert str(summary.id) == str(result_id)
        return summary

    monkeypatch.setattr("app.domain.social.service.send_invite", fake_send_invite)
    monkeypatch.setattr("app.domain.social.service.get_invite_summary", fake_get_invite_summary)

    headers = {
        "X-User-Id": user_id,
        "X-Campus-Id": campus_id,
        "Idempotency-Key": "phase-c-invite",
    }
    payload = {"to_user_id": str(peer_id), "campus_id": campus_id}

    first = await api_client.post("/invites/send", json=payload, headers=headers)
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["id"] == str(invite_id)
    assert first.headers["X-Request-Id"]

    second = await api_client.post("/invites/send", json=payload, headers=headers)
    assert second.status_code == 200
    assert second.json()["id"] == str(invite_id)
    assert second.headers["X-Request-Id"]


@pytest.mark.asyncio
async def test_messages_pagination_advances_and_terminates(api_client, monkeypatch):
    user_id = str(uuid4())
    campus_id = str(uuid4())
    peer_id = str(uuid4())
    base_time = datetime.now(timezone.utc)
    messages: list[MessageResponse] = []
    for idx in range(101):
        created_at = base_time - timedelta(seconds=idx)
        message = MessageResponse(
            message_id=f"msg-{idx:03d}",
            client_msg_id=f"client-{idx:03d}",
            seq=idx + 1,
            conversation_id="chat:conv",
            sender_id=user_id,
            recipient_id=peer_id,
            body=f"message-{idx}",
            attachments=[],
            created_at=created_at,
        )
        messages.append(message)
    messages.sort(key=lambda m: m.created_at, reverse=True)

    async def fake_list_messages(auth_user, user_id_param, *, cursor, limit):
        filtered = messages
        if cursor:
            cursor_dt, cursor_id = cursor
            filtered = [
                m
                for m in messages
                if (m.created_at < cursor_dt)
                or (m.created_at == cursor_dt and m.message_id < cursor_id)
            ]
        page = filtered[:limit]
        next_cursor = None
        if len(page) == limit and len(filtered) > limit:
            last = page[-1]
            next_cursor = encode_cursor(last.created_at, last.message_id)
        return MessageListResponse(items=page, next=next_cursor)

    monkeypatch.setattr("app.domain.chat.service.list_messages", fake_list_messages)
    monkeypatch.setattr("app.api.chat.list_messages", fake_list_messages)

    headers = {"X-User-Id": user_id, "X-Campus-Id": campus_id}

    first = await api_client.get(
        f"/chat/conversations/{peer_id}/messages",
        params={"limit": 50},
        headers=headers,
    )
    assert first.status_code == 200
    first_body = first.json()
    assert len(first_body["items"]) == 50
    assert first_body["next"]

    second = await api_client.get(
        f"/chat/conversations/{peer_id}/messages",
        params={"limit": 50, "cursor": first_body["next"]},
        headers=headers,
    )
    assert second.status_code == 200
    second_body = second.json()
    assert len(second_body["items"]) == 50
    assert second_body["next"]

    third = await api_client.get(
        f"/chat/conversations/{peer_id}/messages",
        params={"limit": 50, "cursor": second_body["next"]},
        headers=headers,
    )
    assert third.status_code == 200
    third_body = third.json()
    assert len(third_body["items"]) == 1
    assert third_body["next"] is None


@pytest.mark.asyncio
async def test_dm_room_creation_idempotency(api_client, monkeypatch, idempotency_stub):
    user_id = "11111111-1111-1111-1111-111111111111"
    campus_id = str(uuid4())
    peer_id = "22222222-2222-2222-2222-222222222222"

    class DummyConnection:
        async def fetchrow(self, *_):
            return {"campus_id": campus_id}

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class DummyPool:
        def acquire(self):
            return DummyConnection()

    async def fake_get_pool():
        return DummyPool()

    ensure_calls: list[tuple[str, str]] = []

    async def fake_ensure_dm_conversation(auth_user, peer):
        ensure_calls.append((str(auth_user.id), str(peer)))
        ordered = tuple(sorted((str(auth_user.id), str(peer))))
        return SimpleNamespace(conversation_id=f"chat:{ordered[0]}:{ordered[1]}")

    monkeypatch.setattr("app.infra.postgres.get_pool", fake_get_pool)
    monkeypatch.setattr("app.api.rooms.get_pool", fake_get_pool)
    monkeypatch.setattr("app.domain.chat.service.ensure_dm_conversation", fake_ensure_dm_conversation)
    monkeypatch.setattr("app.api.rooms.ensure_dm_conversation", fake_ensure_dm_conversation)

    headers = {"X-User-Id": user_id, "X-Campus-Id": campus_id}
    body = {"peer_id": peer_id, "campus_id": campus_id}

    first = await api_client.post("/rooms/dm", json=body, headers=headers)
    assert first.status_code == 201
    first_body = first.json()
    assert first_body["room_id"]

    second = await api_client.post("/rooms/dm", json=body, headers=headers)
    assert second.status_code == 201
    assert second.json()["room_id"] == first_body["room_id"]

    keyed_headers = {**headers, "Idempotency-Key": "explicit-key"}

    third = await api_client.post("/rooms/dm", json=body, headers=keyed_headers)
    assert third.status_code == 201
    assert third.json()["room_id"] == first_body["room_id"]

    fourth = await api_client.post("/rooms/dm", json=body, headers=keyed_headers)
    assert fourth.status_code == 200
    assert fourth.json()["room_id"] == first_body["room_id"]

    assert len(ensure_calls) == 3


@pytest.mark.asyncio
async def test_openapi_bearer_security_declared(api_client):
    response = await api_client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    security_schemes = schema["components"]["securitySchemes"]
    assert "bearerAuth" in security_schemes
    bearer = security_schemes["bearerAuth"]
    assert bearer["type"] == "http"
    assert bearer["scheme"].lower() == "bearer"
    assert {"bearerAuth": []} in schema["security"]
