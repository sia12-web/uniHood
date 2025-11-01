import time
import uuid

import pytest

from app.domain.proximity import service
from app.domain.proximity.models import PrivacySettings
from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_nearby_returns_friend(monkeypatch, api_client):
	campus_id = str(uuid.uuid4())
	user_id = "55555555-5555-5555-5555-555555555555"
	friend_id = "66666666-6666-6666-6666-666666666666"
	now_ms = int(time.time() * 1000)

	await redis_client.hset(
		f"presence:{user_id}", mapping={"lat": 37.0, "lon": -122.0, "ts": now_ms}
	)
	await redis_client.hset(
		f"presence:{friend_id}", mapping={"lat": 37.0001, "lon": -122.0001, "ts": now_ms}
	)

	await redis_client.geoadd(
		f"geo:presence:{campus_id}",
		{
			user_id: (-122.0, 37.0),
			friend_id: (-122.0001, 37.0001),
		},
	)

	async def fake_privacy(user_ids):
		return {friend_id: PrivacySettings(visibility="everyone", blur_distance_m=10)}

	async def fake_friends(self_id, user_ids):
		return {friend_id: True}

	async def fake_blocks(self_id, user_ids):
		return {}

	async def fake_profiles(user_ids):
		return {
			friend_id: {
				"display_name": "Test Friend",
				"handle": "friend",
				"avatar_url": None,
			}
		}

	monkeypatch.setattr(service, "load_privacy", fake_privacy)
	monkeypatch.setattr(service, "load_friendship_flags", fake_friends)
	monkeypatch.setattr(service, "load_blocks", fake_blocks)
	monkeypatch.setattr(service, "_load_user_lite", fake_profiles)

	response = await api_client.get(
		"/proximity/nearby",
		params={"campus_id": campus_id, "radius_m": 50},
		headers={"X-User-Id": user_id, "X-Campus-Id": campus_id},
	)
	assert response.status_code == 200
	data = response.json()
	assert data["cursor"] is None
	assert len(data["items"]) == 1
	item = data["items"][0]
	assert item["user_id"] == friend_id
	# With ~14m actual separation and 10m blur buckets, distance should round up to 20m
	assert item["distance_m"] == 20
	assert item["is_friend"] is True
