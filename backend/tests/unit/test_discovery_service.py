import pytest
from uuid import uuid4

from app.domain.discovery import service
from app.domain.discovery.schemas import DiscoveryFeedResponse
from app.domain.proximity.schemas import NearbyQuery, NearbyUser
from app.infra.auth import AuthenticatedUser


class DummyAuth(AuthenticatedUser):
	"""Thin wrapper to satisfy type hints without extra fields."""  # pragma: no cover - doc only


@pytest.mark.asyncio
async def test_feed_filters_out_liked_and_passed(fake_redis, monkeypatch):
	user = AuthenticatedUser(id="user-a", campus_id="campus-1")

	nearby_users = [
		NearbyUser(user_id=uuid4(), display_name="Keep", handle="keep", distance_m=10.0, email_verified=True),
		NearbyUser(user_id=uuid4(), display_name="Like", handle="like", distance_m=12.0, email_verified=True),
		NearbyUser(user_id=uuid4(), display_name="Pass", handle="pass", distance_m=14.0, email_verified=True),
	]

	async def fake_get_nearby(auth_user, query: NearbyQuery):
		return type(
			"NearbyResponse",
			(),
			{
				"items": nearby_users,
				"cursor": None,
			},
		)()

	# Mark one as liked and one as passed
	await fake_redis.sadd("discovery:like:user-a", str(nearby_users[1].user_id))
	await fake_redis.sadd("discovery:pass:user-a", str(nearby_users[2].user_id))

	monkeypatch.setattr(service, "get_nearby", fake_get_nearby)

	resp: DiscoveryFeedResponse = await service.list_feed(user, cursor=None, limit=10)

	assert len(resp.items) == 1
	assert resp.items[0].handle == "keep"


@pytest.mark.asyncio
async def test_like_creates_match_when_mutual(fake_redis):
	user_a = AuthenticatedUser(id="user-a", campus_id="campus-1")
	user_b_id = uuid4()

	# Seed reciprocal like
	await fake_redis.sadd("discovery:like:{}".format(user_b_id), user_a.id)

	resp = await service.register_like(user_a, user_b_id, cursor=None)

	assert resp.exhausted is False
	assert await fake_redis.sismember("discovery:match:user-a", str(user_b_id))
	assert await fake_redis.sismember(f"discovery:match:{user_b_id}", user_a.id)


@pytest.mark.asyncio
async def test_like_emits_match_event_on_mutual(monkeypatch, fake_redis):
	user_a = AuthenticatedUser(id="user-a", campus_id="campus-1")
	user_b_id = uuid4()

	await fake_redis.sadd(f"discovery:like:{user_b_id}", user_a.id)

	emitted: list[tuple[str, dict]] = []

	async def fake_emit(uid: str, payload: dict) -> None:
		emitted.append((uid, payload))

	monkeypatch.setattr(service, "emit_discovery_match", fake_emit)

	await service.register_like(user_a, user_b_id, cursor=None)

	# Two emits: to self and to peer
	assert len(emitted) == 2
	assert any(e[0] == user_a.id and e[1].get("peer_id") == str(user_b_id) for e in emitted)
	assert any(e[0] == str(user_b_id) and e[1].get("peer_id") == user_a.id for e in emitted)
