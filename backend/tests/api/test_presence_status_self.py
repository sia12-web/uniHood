import time
import uuid

import pytest

from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_status_returns_online(api_client):
	user_id = "33333333-3333-3333-3333-333333333333"
	ts = int(time.time() * 1000)
	await redis_client.hset(f"presence:{user_id}", mapping={"ts": ts})
	await redis_client.setex(f"online:user:{user_id}", 90, "1")

	response = await api_client.get(
		"/presence/status/self",
		headers={"X-User-Id": user_id, "X-Campus-Id": str(uuid.uuid4())},
	)
	assert response.status_code == 200
	body = response.json()
	assert body["online"] is True
	assert body["ts"] == ts


@pytest.mark.asyncio
async def test_status_returns_offline_when_no_presence(api_client):
	user_id = "44444444-4444-4444-4444-444444444444"
	response = await api_client.get(
		"/presence/status/self",
		headers={"X-User-Id": user_id, "X-Campus-Id": str(uuid.uuid4())},
	)
	assert response.status_code == 200
	assert response.json() == {"online": False, "ts": None}
