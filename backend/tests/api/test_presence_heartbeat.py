import time
import uuid

import pytest

from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_heartbeat_stores_presence(api_client):
	campus_id = str(uuid.uuid4())
	payload = {
		"lat": 37.7749,
		"lon": -122.4194,
		"accuracy_m": 15,
		"campus_id": campus_id,
		"device_id": "device-123",
		"ts_client": int(time.time() * 1000),
	}
	headers = {"X-User-Id": "11111111-1111-1111-1111-111111111111", "X-Campus-Id": campus_id}

	response = await api_client.post("/presence/heartbeat", json=payload, headers=headers)
	assert response.status_code == 200

	stored = await redis_client.hgetall("presence:11111111-1111-1111-1111-111111111111")
	assert stored["campus_id"] == campus_id
	assert stored["device_id"] == "device-123"


@pytest.mark.asyncio
async def test_heartbeat_rejects_campus_mismatch(api_client):
	payload = {
		"lat": 37.0,
		"lon": -122.0,
		"accuracy_m": 10,
		"campus_id": str(uuid.uuid4()),
		"device_id": "device-999",
		"ts_client": int(time.time() * 1000),
	}
	headers = {"X-User-Id": "22222222-2222-2222-2222-222222222222", "X-Campus-Id": str(uuid.uuid4())}

	response = await api_client.post("/presence/heartbeat", json=payload, headers=headers)
	assert response.status_code == 403
