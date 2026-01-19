
import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from app.domain.campuses.service import CampusService
from app.domain.social.sockets import SocialNamespace
from app.infra.redis import redis_client
from app.infra import postgres
from app.settings import settings

@pytest.mark.asyncio
async def test_campus_find_by_domain_logic():
    service = CampusService()
    
    # Mock DB response
    mock_rows = [
        {"id": uuid4(), "name": "Concordia", "domain": "concordia.ca"},
        {"id": uuid4(), "name": "McGill", "domain": "mcgill.ca"},
    ]
    
    # Configure the mock pool returned by postgres.get_pool()
    pool = await postgres.get_pool()
    conn_mock = AsyncMock()
    conn_mock.fetch.return_value = mock_rows
    # Ensure nested async context manager structure works: async with pool.acquire() as conn
    pool.acquire.return_value.__aenter__.return_value = conn_mock

    # Test 1: Exact match
    result = await service.find_by_domain("concordia.ca")
    assert result is not None
    assert result["name"] == "Concordia"

    # Test 2: Suffix match
    result = await service.find_by_domain("mail.concordia.ca")
    assert result is not None
    assert result["name"] == "Concordia"
    
    # Test 3: Multiple dot suffix
    result = await service.find_by_domain("student.mail.mcgill.ca")
    assert result is not None
    assert result["name"] == "McGill"

    # Test 4: No match (logic relies on mock_rows, utoronto is not there)
    result = await service.find_by_domain("utoronto.ca")
    assert result is None
    
    # Test 5: False suffix (e.g. 'aconcordia.ca' should NOT match 'concordia.ca')
    result = await service.find_by_domain("aconcordia.ca")
    assert result is None


@pytest.mark.asyncio
async def test_social_socket_online_ttl(fake_redis):
    # Test _mark_online sets correct TTL (300s)
    ns = SocialNamespace()
    user_id = str(uuid4())
    
    await ns._mark_online(user_id)
    
    ttl = await redis_client.ttl(f"online:user:{user_id}")
    val = await redis_client.get(f"online:user:{user_id}")
    
    assert val == "1"
    # value should be <= 300 (5 mins).
    assert 0 < ttl <= 300

@pytest.mark.asyncio
async def test_presence_heartbeat_online_ttl(api_client, fake_redis):
    # Test POST /presence/heartbeat sets correct TTL (300s) on online key
    
    user_id = str(uuid4())
    campus_id = str(uuid4())
    
    headers = {
        "X-User-Id": user_id,
        "X-Campus-Id": campus_id,
    }
    
    payload = {
        "lat": 45.5,
        "lon": -73.5,
        "accuracy_m": 10,
        "ts_client": 1234567890,
        "device_id": "test-device"
    }
    
    resp = await api_client.post("/presence/heartbeat", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    
    # Check redis keys
    online_key = f"online:user:{user_id}"
    ttl = await fake_redis.ttl(online_key)
    
    # Should be 5 mins (300s)
    assert 0 < ttl <= 300
    
    # Check presence key is still long-lived (e.g. 3h = 10800s)
    presence_key = f"presence:{user_id}"
    presence_ttl = await fake_redis.ttl(presence_key)
    
    # settings.campus_ttl_seconds is default 10800. 
    # Just ensure it's significantly larger than 300.
    assert presence_ttl > 300
