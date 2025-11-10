from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.social import service
from app.domain.social.exceptions import InviteAlreadySent, InviteForbidden
from app.domain.social.schemas import FriendRow, InviteSummary


def _sample_invite(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "id": uuid4(),
        "from_user_id": uuid4(),
        "to_user_id": uuid4(),
        "status": "sent",
        "created_at": now,
        "updated_at": now,
        "expires_at": now,
    }
    payload.update(overrides)
    return InviteSummary(**payload)


@pytest.mark.asyncio
async def test_send_invite_success(monkeypatch, api_client):
    summary = _sample_invite(status="sent")

    async def fake_send(auth_user, to_user_id, campus_id):
        return summary

    monkeypatch.setattr(service, "send_invite", fake_send)

    response = await api_client.post(
        "/invites/send",
        json={"to_user_id": str(uuid4())},
        headers={"X-User-Id": "aaaa", "X-Campus-Id": "campus"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == str(summary.id)
    assert body["status"] == summary.status


@pytest.mark.asyncio
async def test_send_invite_conflict(monkeypatch, api_client):
    async def fake_send(auth_user, to_user_id, campus_id):
        raise InviteAlreadySent()

    monkeypatch.setattr(service, "send_invite", fake_send)

    response = await api_client.post(
        "/invites/send",
        json={"to_user_id": str(uuid4())},
        headers={"X-User-Id": "aaaa", "X-Campus-Id": "campus"},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_accept_invite_forbidden(monkeypatch, api_client):
    async def fake_accept(auth_user, invite_id):
        raise InviteForbidden("not_recipient")

    monkeypatch.setattr(service, "accept_invite", fake_accept)

    invite_id = uuid4()
    response = await api_client.post(
        f"/invites/{invite_id}/accept",
        headers={"X-User-Id": "aaaa", "X-Campus-Id": "campus"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "not_recipient"


@pytest.mark.asyncio
async def test_block_user_success(monkeypatch, api_client):
    row = FriendRow(
        user_id=uuid4(),
        friend_id=uuid4(),
        status="blocked",
        created_at=datetime.now(timezone.utc),
    )

    async def fake_block(auth_user, target_user_id):
        return row

    monkeypatch.setattr(service, "block_user", fake_block)

    response = await api_client.post(
        f"/friends/{row.friend_id}/block",
        headers={"X-User-Id": str(row.user_id), "X-Campus-Id": "campus"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "blocked"
    assert body["friend_id"] == str(row.friend_id)


@pytest.mark.asyncio
async def test_remove_friend_success(monkeypatch, api_client):
    user_id = uuid4()
    target_id = uuid4()

    async def fake_remove(auth_user, target_user_id):
        return None

    monkeypatch.setattr(service, "remove_friend", fake_remove)

    response = await api_client.post(
        f"/friends/{target_id}/remove",
        headers={"X-User-Id": str(user_id), "X-Campus-Id": "campus"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
