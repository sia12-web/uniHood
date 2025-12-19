"""Tests for Room mode live proximity filtering (100m cap).

Room mode uses Redis GEO set `geo:presence:global` and requires recent presence heartbeats.
"""

import time
import uuid

import pytest

from app.domain.proximity import service
from app.domain.proximity.models import PrivacySettings
from app.infra.redis import redis_client
from app.settings import settings


@pytest.mark.asyncio
async def test_room_mode_filters_by_100m_radius(monkeypatch, api_client):
	"""Verify that Room mode (radius=100m) only returns users within 100m."""
	campus_id = str(uuid.uuid4())
	user_id = "11111111-1111-1111-1111-111111111111"
	
	# User A: 50m away (within 100m - should appear)
	user_a = "22222222-2222-2222-2222-222222222222"
	# User B: 150m away (outside 100m - should NOT appear)
	user_b = "33333333-3333-3333-3333-333333333333"
	# User C: 80m away (within 100m - should appear)
	user_c = "44444444-4444-4444-4444-444444444444"
	
	now_ms = int(time.time() * 1000)
	
	# Set up presence for all users
	# User at origin (0, 0)
	await redis_client.hset(
		f"presence:{user_id}", 
		mapping={"lat": "45.5", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id}
	)
	
	# User A: ~50m north (0.00045 degrees latitude ≈ 50m)
	await redis_client.hset(
		f"presence:{user_a}", 
		mapping={"lat": "45.50045", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id}
	)
	
	# User B: ~150m north (0.00135 degrees latitude ≈ 150m)
	await redis_client.hset(
		f"presence:{user_b}", 
		mapping={"lat": "45.50135", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id}
	)
	
	# User C: ~80m east (0.00072 degrees longitude at 45.5° lat ≈ 80m)
	await redis_client.hset(
		f"presence:{user_c}", 
		mapping={"lat": "45.5", "lon": "-73.59928", "ts": now_ms, "campus_id": campus_id}
	)
	
	# Add users to the Room mode global geo set
	await redis_client.geoadd(
		"geo:presence:global",
		{
			user_id: (-73.6, 45.5),
			user_a: (-73.6, 45.50045),  # ~50m away
			user_b: (-73.6, 45.50135),  # ~150m away
			user_c: (-73.59928, 45.5),   # ~80m away
		},
	)
	
	# Mock the dependencies
	async def fake_privacy(user_ids):
		return {uid: PrivacySettings(visibility="everyone", blur_distance_m=10) for uid in user_ids}
	
	async def fake_friends(self_id, user_ids):
		return {}
	
	async def fake_blocks(self_id, user_ids):
		return {}
	
	async def fake_profiles(user_ids):
		profiles = {
			user_a: {"display_name": "User A (50m)", "handle": "user_a", "avatar_url": None},
			user_b: {"display_name": "User B (150m)", "handle": "user_b", "avatar_url": None},
			user_c: {"display_name": "User C (80m)", "handle": "user_c", "avatar_url": None},
		}
		return {uid: profiles.get(uid, {}) for uid in user_ids if uid in profiles}
	
	monkeypatch.setattr(service, "load_privacy", fake_privacy)
	monkeypatch.setattr(service, "load_friendship_flags", fake_friends)
	monkeypatch.setattr(service, "load_blocks", fake_blocks)
	monkeypatch.setattr(service, "_load_user_lite", fake_profiles)
	
	# Request with 100m radius (Room mode)
	response = await api_client.get(
		"/proximity/nearby",
		params={"campus_id": campus_id, "radius_m": 100, "mode": "room", "scope": "global"},
		headers={"X-User-Id": user_id, "X-Campus-Id": campus_id},
	)
	
	assert response.status_code == 200
	data = response.json()
	
	# Get the user IDs from the response
	returned_user_ids = {item["user_id"] for item in data["items"]}
	
	# User A (50m) and User C (80m) should be in results
	assert user_a in returned_user_ids, "User A (50m away) should appear in 100m radius"
	assert user_c in returned_user_ids, "User C (80m away) should appear in 100m radius"
	
	# User B (150m) should NOT be in results
	assert user_b not in returned_user_ids, "User B (150m away) should NOT appear in 100m radius"


@pytest.mark.asyncio
async def test_room_mode_excludes_users_outside_radius(monkeypatch, api_client):
	"""Verify that users outside the specified radius are excluded."""
	campus_id = str(uuid.uuid4())
	user_id = "55555555-5555-5555-5555-555555555555"
	
	# User far away (2km = 2000m)
	far_user = "66666666-6666-6666-6666-666666666666"
	
	now_ms = int(time.time() * 1000)
	
	# Set up presence
	await redis_client.hset(
		f"presence:{user_id}", 
		mapping={"lat": "45.5", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id}
	)
	
	# Far user: ~2km north (0.018 degrees latitude ≈ 2000m)
	await redis_client.hset(
		f"presence:{far_user}", 
		mapping={"lat": "45.518", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id}
	)
	
	# Add to the Room mode global geo set
	await redis_client.geoadd(
		"geo:presence:global",
		{
			user_id: (-73.6, 45.5),
			far_user: (-73.6, 45.518),  # ~2km away
		},
	)
	
	# Mock dependencies
	async def fake_privacy(user_ids):
		return {uid: PrivacySettings(visibility="everyone", blur_distance_m=10) for uid in user_ids}
	
	async def fake_friends(self_id, user_ids):
		return {}
	
	async def fake_blocks(self_id, user_ids):
		return {}
	
	async def fake_profiles(user_ids):
		return {far_user: {"display_name": "Far User", "handle": "far_user", "avatar_url": None}}
	
	monkeypatch.setattr(service, "load_privacy", fake_privacy)
	monkeypatch.setattr(service, "load_friendship_flags", fake_friends)
	monkeypatch.setattr(service, "load_blocks", fake_blocks)
	monkeypatch.setattr(service, "_load_user_lite", fake_profiles)
	
	# Request with 100m radius (Room mode)
	response = await api_client.get(
		"/proximity/nearby",
		params={"campus_id": campus_id, "radius_m": 100, "mode": "room", "scope": "global"},
		headers={"X-User-Id": user_id, "X-Campus-Id": campus_id},
	)
	
	assert response.status_code == 200
	data = response.json()
	
	# No users should be returned (far_user is 2km away)
	assert len(data["items"]) == 0, "No users should appear when nearest user is 2km away"


@pytest.mark.asyncio
async def test_room_mode_excludes_stale_and_missing_presence(monkeypatch, api_client):
	"""Room mode must only return users with a recent location heartbeat.

	This guards against showing users who are "online" due to other activity (chat)
	but have not shared location recently, and against stale GEO members that lack
	an associated presence hash.
	"""
	original_stale = settings.presence_stale_seconds
	settings.presence_stale_seconds = 1
	try:
		campus_id = str(uuid.uuid4())
		auth_user_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
		fresh_user = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
		stale_user = "cccccccc-cccc-cccc-cccc-cccccccccccc"
		ghost_user = "dddddddd-dddd-dddd-dddd-dddddddddddd"

		now_ms = int(time.time() * 1000)
		stale_ts = now_ms - 10_000  # definitely older than 1s

		# Auth user presence (center point)
		await redis_client.hset(
			f"presence:{auth_user_id}",
			mapping={"lat": "45.5", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id},
		)

		# Fresh nearby user
		await redis_client.hset(
			f"presence:{fresh_user}",
			mapping={"lat": "45.5002", "lon": "-73.6", "ts": now_ms, "campus_id": campus_id},
		)

		# Stale nearby user (ts too old), but mark as online to simulate chat activity
		await redis_client.hset(
			f"presence:{stale_user}",
			mapping={"lat": "45.5002", "lon": "-73.6", "ts": stale_ts, "campus_id": campus_id},
		)
		await redis_client.setex(f"online:user:{stale_user}", 999, "1")

		# Add to global GEO set used by Room mode
		await redis_client.geoadd(
			"geo:presence:global",
			{
				auth_user_id: (-73.6, 45.5),
				fresh_user: (-73.6, 45.5002),
				stale_user: (-73.6, 45.5002),
				ghost_user: (-73.6, 45.5002),
			},
		)

		# Mock the dependencies
		async def fake_privacy(user_ids):
			return {uid: PrivacySettings(visibility="everyone", blur_distance_m=10) for uid in user_ids}

		async def fake_friends(self_id, user_ids):
			return {}

		async def fake_blocks(self_id, user_ids):
			return {}

		async def fake_profiles(user_ids):
			profiles = {
				fresh_user: {"display_name": "Fresh", "handle": "fresh", "avatar_url": None},
				stale_user: {"display_name": "Stale", "handle": "stale", "avatar_url": None},
				ghost_user: {"display_name": "Ghost", "handle": "ghost", "avatar_url": None},
			}
			return {uid: profiles.get(uid, {}) for uid in user_ids if uid in profiles}

		monkeypatch.setattr(service, "load_privacy", fake_privacy)
		monkeypatch.setattr(service, "load_friendship_flags", fake_friends)
		monkeypatch.setattr(service, "load_blocks", fake_blocks)
		monkeypatch.setattr(service, "_load_user_lite", fake_profiles)

		response = await api_client.get(
			"/proximity/nearby",
			params={"radius_m": 100, "mode": "room", "scope": "global"},
			headers={"X-User-Id": auth_user_id, "X-Campus-Id": campus_id},
		)
		assert response.status_code == 200
		data = response.json()
		returned_user_ids = {item["user_id"] for item in data["items"]}
		assert fresh_user in returned_user_ids
		assert stale_user not in returned_user_ids
		assert ghost_user not in returned_user_ids
	finally:
		settings.presence_stale_seconds = original_stale


@pytest.mark.asyncio
async def test_room_mode_returns_empty_when_requester_has_no_location(api_client):
	"""Room mode should not crash if requester presence lacks lat/lon.

	This can happen if the presence hash exists (e.g., other activity) but the user
	has not shared location.
	"""
	campus_id = str(uuid.uuid4())
	auth_user_id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

	now_ms = int(time.time() * 1000)
	# Presence exists but location fields are missing.
	await redis_client.hset(
		f"presence:{auth_user_id}",
		mapping={"ts": now_ms, "campus_id": campus_id},
	)

	response = await api_client.get(
		"/proximity/nearby",
		params={"radius_m": 100, "mode": "room", "scope": "global"},
		headers={"X-User-Id": auth_user_id, "X-Campus-Id": campus_id},
	)
	assert response.status_code == 200
	data = response.json()
	assert data["items"] == []
	assert data["cursor"] is None
