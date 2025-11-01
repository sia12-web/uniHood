"""API surface tests for communities Phase 5/6 endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.communities.api import (
	audit as audit_api,
	bans_mutes as bans_mutes_api,
	comments as comments_api,
	escalate as escalate_api,
	invites as invites_api,
	join_requests as join_requests_api,
	notifications as notifications_api,
	posts as posts_api,
	presence as presence_api,
	roles as roles_api,
)
from app.communities.schemas import dto


def _parse_ts(value: str) -> datetime:
	"""Parse ISO-8601 timestamps that may end with 'Z'."""
	return datetime.fromisoformat(value.replace("Z", "+00:00"))


@pytest.fixture()
def user_headers() -> dict[str, str]:
	return {
		"X-User-Id": str(uuid4()),
		"X-Campus-Id": str(uuid4()),
	}


@pytest.mark.asyncio
async def test_notifications_list_endpoint(api_client, monkeypatch, user_headers):
	now = datetime.now(timezone.utc)
	ref_id = uuid4()
	actor_id = uuid4()
	response_payload = dto.NotificationListResponse(
		items=[
			dto.NotificationResponse(
				id=1,
				user_id=UUID(user_headers["X-User-Id"]),
				type="post.created",
				ref_id=ref_id,
				actor_id=actor_id,
				payload={"kind": "post"},
				is_read=False,
				is_delivered=True,
				created_at=now,
			)
		],
		next_cursor="cursor123",
	)

	class StubNotificationService:
		async def list_notifications(self, auth_user, *, limit, cursor=None):
			assert auth_user.id == user_headers["X-User-Id"]
			assert limit == 10
			assert cursor == "abc"
			return response_payload

	monkeypatch.setattr(notifications_api, "_service", StubNotificationService())

	resp = await api_client.get(
		"/api/communities/v1/notifications",
		headers=user_headers,
		params={"limit": 10, "cursor": "abc"},
	)
	assert resp.status_code == 200
	data = resp.json()
	assert data["next_cursor"] == "cursor123"
	assert len(data["items"]) == 1
	item = data["items"][0]
	assert item["id"] == 1
	assert item["user_id"] == user_headers["X-User-Id"]
	assert item["type"] == "post.created"
	assert item["ref_id"] == str(ref_id)
	assert item["actor_id"] == str(actor_id)
	assert item["payload"] == {"kind": "post"}
	assert item["is_read"] is False
	assert item["is_delivered"] is True
	assert _parse_ts(item["created_at"]) == now


@pytest.mark.asyncio
async def test_notifications_mark_read_endpoint(api_client, monkeypatch, user_headers):
	class StubNotificationService:
		async def mark_notifications(self, auth_user, payload):
			assert payload.ids == [1, 2]
			assert payload.mark_read is True
			return 2

	monkeypatch.setattr(notifications_api, "_service", StubNotificationService())

	resp = await api_client.post(
		"/api/communities/v1/notifications/mark-read",
		headers=user_headers,
		json={"ids": [1, 2], "mark_read": True},
	)
	assert resp.status_code == 200
	assert resp.json() == {"updated": 2}


@pytest.mark.asyncio
async def test_notifications_unread_endpoint(api_client, monkeypatch, user_headers):
	class StubNotificationService:
		async def unread_count(self, auth_user):
			assert auth_user.id == user_headers["X-User-Id"]
			return dto.NotificationUnreadResponse(count=7)

	monkeypatch.setattr(notifications_api, "_service", StubNotificationService())

	resp = await api_client.get(
		"/api/communities/v1/notifications/unread",
		headers=user_headers,
	)
	assert resp.status_code == 200
	assert resp.json() == {"count": 7}


@pytest.mark.asyncio
async def test_presence_heartbeat_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	response_payload = dto.PresenceListResponse(
		group_id=None,
		items=[
			dto.PresenceMemberStatus(
				user_id=uuid4(),
				online=True,
				last_seen=now,
			)
		],
	)

	class StubRepo:
		async def get_member(self, gid, user_id):
			assert gid == group_id
			assert isinstance(user_id, UUID)
			return SimpleNamespace(is_banned=False)

	class StubPresenceService:
		async def heartbeat(self, auth_user, payload):
			assert payload.group_ids == [group_id]
			return response_payload

	monkeypatch.setattr(presence_api, "_repo", StubRepo())
	monkeypatch.setattr(presence_api, "_service", StubPresenceService())

	resp = await api_client.post(
		"/api/communities/v1/presence/heartbeat",
		headers=user_headers,
		json={"group_ids": [str(group_id)]},
	)
	assert resp.status_code == 200
	body = resp.json()
	assert body["group_id"] is None
	assert len(body["items"]) == 1
	item = body["items"][0]
	assert item["user_id"] == str(response_payload.items[0].user_id)
	assert item["online"] is True
	assert _parse_ts(item["last_seen"]) == now


@pytest.mark.asyncio
async def test_presence_heartbeat_requires_membership(api_client, monkeypatch, user_headers):
	group_id = uuid4()

	class StubRepo:
		async def get_member(self, gid, user_id):
			return None

	monkeypatch.setattr(presence_api, "_repo", StubRepo())

	resp = await api_client.post(
		"/api/communities/v1/presence/heartbeat",
		headers=user_headers,
		json={"group_ids": [str(group_id)]},
	)
	assert resp.status_code == 403


@pytest.mark.asyncio
async def test_presence_list_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	response_payload = dto.PresenceListResponse(
		group_id=group_id,
		items=[
			dto.PresenceMemberStatus(
				user_id=uuid4(),
				online=True,
				last_seen=now,
			)
		],
	)

	class StubRepo:
		async def get_member(self, gid, user_id):
			return SimpleNamespace(is_banned=False)

	class StubPresenceService:
		async def list_group_presence(self, auth_user, gid):
			assert gid == group_id
			return response_payload

	monkeypatch.setattr(presence_api, "_repo", StubRepo())
	monkeypatch.setattr(presence_api, "_service", StubPresenceService())

	resp = await api_client.get(
		f"/api/communities/v1/presence/{group_id}",
		headers=user_headers,
	)
	assert resp.status_code == 200
	body = resp.json()
	assert body["group_id"] == str(group_id)
	assert len(body["items"]) == 1
	item = body["items"][0]
	assert item["user_id"] == str(response_payload.items[0].user_id)
	assert item["online"] is True
	assert _parse_ts(item["last_seen"]) == now


@pytest.mark.asyncio
async def test_roles_list_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	members = [
		dto.MemberResponse(
			id=uuid4(),
			group_id=group_id,
			user_id=uuid4(),
			role="member",
			joined_at=now,
			muted_until=None,
			is_banned=False,
		)
	]

	class StubRolesService:
		async def list_roles(self, auth_user, gid):
			assert gid == group_id
			return members

	monkeypatch.setattr(roles_api, "_service", StubRolesService())

	resp = await api_client.get(
		f"/api/communities/v1/groups/{group_id}/roles",
		headers=user_headers,
	)
	assert resp.status_code == 200
	items = resp.json()
	assert len(items) == 1
	role = items[0]
	assert role["id"] == str(members[0].id)
	assert role["group_id"] == str(group_id)
	assert role["user_id"] == str(members[0].user_id)
	assert role["role"] == "member"
	assert _parse_ts(role["joined_at"]) == now
	assert role["muted_until"] is None
	assert role["is_banned"] is False


@pytest.mark.asyncio
async def test_roles_assign_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	member_response = dto.MemberResponse(
		id=uuid4(),
		group_id=group_id,
		user_id=uuid4(),
		role="moderator",
		joined_at=now,
		muted_until=None,
		is_banned=False,
	)

	class StubRolesService:
		async def assign_role(self, auth_user, gid, payload):
			assert payload.role == "moderator"
			return member_response

	monkeypatch.setattr(roles_api, "_service", StubRolesService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/roles",
		headers=user_headers,
		json={"user_id": str(member_response.user_id), "role": "moderator"},
	)
	assert resp.status_code == 200
	assert resp.json()["role"] == "moderator"


@pytest.mark.asyncio
async def test_invites_create_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	invite_response = dto.InviteResponse(
		id=uuid4(),
		group_id=group_id,
		invited_user_id=uuid4(),
		invited_by=UUID(user_headers["X-User-Id"]),
		role="moderator",
		expires_at=None,
		accepted_at=None,
		created_at=now,
	)

	class StubInvitesService:
		async def create_invite(self, auth_user, gid, payload):
			assert gid == group_id
			assert payload.role == "moderator"
			return invite_response

	monkeypatch.setattr(invites_api, "_service", StubInvitesService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/invites",
		headers=user_headers,
		json={"user_id": str(invite_response.invited_user_id), "role": "moderator"},
	)
	assert resp.status_code == 201
	data = resp.json()
	assert data["role"] == "moderator"
	assert data["group_id"] == str(group_id)


@pytest.mark.asyncio
async def test_invites_accept_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	invite_id = uuid4()
	invite_response = dto.InviteResponse(
		id=invite_id,
		group_id=group_id,
		invited_user_id=UUID(user_headers["X-User-Id"]),
		invited_by=uuid4(),
		role="member",
		expires_at=None,
		accepted_at=now,
		created_at=now,
	)

	class StubInvitesService:
		async def accept_invite(self, iid, auth_user):
			assert iid == invite_id
			return invite_response

	monkeypatch.setattr(invites_api, "_service", StubInvitesService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/invites/{invite_id}/accept",
		headers=user_headers,
	)
	assert resp.status_code == 200
	assert _parse_ts(resp.json()["accepted_at"]) == now


@pytest.mark.asyncio
async def test_join_requests_submit_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	join_response = dto.JoinRequestResponse(
		id=uuid4(),
		group_id=group_id,
		user_id=UUID(user_headers["X-User-Id"]),
		status="pending",
		reviewed_by=None,
		reviewed_at=None,
		created_at=now,
	)

	class StubJoinRequestsService:
		async def submit(self, auth_user, gid, payload):
			assert gid == group_id
			assert payload.message == "please"
			return join_response

	monkeypatch.setattr(join_requests_api, "_service", StubJoinRequestsService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/join-requests",
		headers=user_headers,
		json={"message": "please"},
	)
	assert resp.status_code == 201
	assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_join_requests_list_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	responses = [
		dto.JoinRequestResponse(
			id=uuid4(),
			group_id=group_id,
			user_id=uuid4(),
			status="pending",
			reviewed_by=None,
			reviewed_at=None,
			created_at=now,
		)
	]

	class StubJoinRequestsService:
		async def list_requests(self, auth_user, gid, *, status=None):
			assert status == "pending"
			return responses

	monkeypatch.setattr(join_requests_api, "_service", StubJoinRequestsService())

	resp = await api_client.get(
		f"/api/communities/v1/groups/{group_id}/join-requests",
		headers=user_headers,
		params={"status": "pending"},
	)
	assert resp.status_code == 200
	assert resp.json()[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_join_requests_review_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	request_id = uuid4()
	now = datetime.now(timezone.utc)
	join_response = dto.JoinRequestResponse(
		id=request_id,
		group_id=group_id,
		user_id=uuid4(),
		status="approved",
		reviewed_by=uuid4(),
		reviewed_at=now,
		created_at=now,
	)

	class StubJoinRequestsService:
		async def review(self, auth_user, rid, status):
			assert rid == request_id
			assert status == "approved"
			return join_response

	monkeypatch.setattr(join_requests_api, "_service", StubJoinRequestsService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/join-requests/{request_id}/review",
		headers=user_headers,
		json={"status": "approved"},
	)
	assert resp.status_code == 200
	assert resp.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_create_post_endpoint_includes_moderation(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)

	class StubService:
		async def create_post(self, auth_user, gid, payload, *, idempotency_key=None):
			assert gid == group_id
			assert payload.body == "Hello"
			return dto.PostResponse(
				id=uuid4(),
				group_id=gid,
				author_id=UUID(user_headers["X-User-Id"]),
				title=payload.title,
				body="Hello",
				topic_tags=list(payload.topic_tags),
				media_count=0,
				reactions_count=0,
				comments_count=0,
				is_pinned=False,
				created_at=now,
				updated_at=now,
				moderation={"shadowed": True, "link_cooloff": True},
			)

	monkeypatch.setattr(posts_api, "_service", StubService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/posts",
		headers=user_headers,
		json={"title": "Hello", "body": "Hello", "topic_tags": ["study"]},
	)
	assert resp.status_code == 201
	body = resp.json()
	assert body["moderation"] == {"shadowed": True, "link_cooloff": True}


@pytest.mark.asyncio
async def test_create_comment_endpoint_includes_moderation(api_client, monkeypatch, user_headers):
	post_id = uuid4()
	now = datetime.now(timezone.utc)

	class StubService:
		async def create_comment(self, auth_user, pid, payload, *, idempotency_key=None):
			assert pid == post_id
			assert payload.body == "World"
			return dto.CommentResponse(
				id=uuid4(),
				post_id=pid,
				author_id=UUID(user_headers["X-User-Id"]),
				parent_id=None,
				body="World",
				depth=0,
				reactions_count=0,
				created_at=now,
				updated_at=now,
				moderation={"links_stripped": True},
			)

	monkeypatch.setattr(comments_api, "_service", StubService())

	resp = await api_client.post(
		f"/api/communities/v1/posts/{post_id}/comments",
		headers=user_headers,
		json={"body": "World"},
	)
	assert resp.status_code == 201
	body = resp.json()
	assert body["moderation"] == {"links_stripped": True}


@pytest.mark.asyncio
async def test_bans_mutes_apply_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	member_response = dto.MemberResponse(
		id=uuid4(),
		group_id=group_id,
		user_id=uuid4(),
		role="member",
		joined_at=now,
		muted_until=now,
		is_banned=True,
	)

	class StubModerationService:
		async def apply(self, auth_user, gid, payload):
			assert payload.is_banned is True
			return member_response

	monkeypatch.setattr(bans_mutes_api, "_service", StubModerationService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/bans-mutes",
		headers=user_headers,
		json={"user_id": str(member_response.user_id), "is_banned": True},
	)
	assert resp.status_code == 200
	assert resp.json()["is_banned"] is True


@pytest.mark.asyncio
async def test_bans_mutes_list_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	members = [
		dto.MemberResponse(
			id=uuid4(),
			group_id=group_id,
			user_id=uuid4(),
			role="member",
			joined_at=now,
			muted_until=None,
			is_banned=True,
		)
	]

	class StubModerationService:
		async def list_bans(self, auth_user, gid):
			assert gid == group_id
			return members

	monkeypatch.setattr(bans_mutes_api, "_service", StubModerationService())

	resp = await api_client.get(
		f"/api/communities/v1/groups/{group_id}/bans-mutes",
		headers=user_headers,
	)
	assert resp.status_code == 200
	assert resp.json()[0]["is_banned"] is True


@pytest.mark.asyncio
async def test_audit_list_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	audit_entries = [
		dto.AuditEventResponse(
			id=uuid4(),
			group_id=group_id,
			user_id=uuid4(),
			action="role.assign",
			details={"target_user_id": str(uuid4())},
			created_at=now,
		)
	]

	class StubAuditService:
		async def list_events(self, auth_user, gid, *, limit=50):
			assert limit == 25
			return audit_entries

	monkeypatch.setattr(audit_api, "_service", StubAuditService())

	resp = await api_client.get(
		f"/api/communities/v1/groups/{group_id}/audit",
		headers=user_headers,
		params={"limit": 25},
	)
	assert resp.status_code == 200
	assert resp.json()[0]["action"] == "role.assign"


@pytest.mark.asyncio
async def test_escalate_endpoint(api_client, monkeypatch, user_headers):
	group_id = uuid4()
	now = datetime.now(timezone.utc)
	audit_entry = dto.AuditEventResponse(
		id=uuid4(),
		group_id=group_id,
		user_id=UUID(user_headers["X-User-Id"]),
		action="moderation.escalate",
		details={"reason": "harassment"},
		created_at=now,
	)

	class StubEscalationService:
		async def escalate(self, auth_user, gid, payload):
			assert payload.reason == "harassment"
			return audit_entry

	monkeypatch.setattr(escalate_api, "_service", StubEscalationService())

	resp = await api_client.post(
		f"/api/communities/v1/groups/{group_id}/escalate",
		headers=user_headers,
		json={"reason": "harassment"},
	)
	assert resp.status_code == 202
	assert resp.json()["action"] == "moderation.escalate"
