import time
from unittest.mock import AsyncMock

import pytest
import socketio

from app.domain.proximity.sockets import PresenceNamespace
from app.infra.redis import redis_client


def _scope_with_authorization(token: str) -> dict:
	return {
		"headers": [(b"authorization", f"Bearer {token}".encode())],
	}


@pytest.mark.asyncio
async def test_connect_requires_token():
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)

	with pytest.raises(ConnectionRefusedError):
		await namespace.trigger_event("connect", "sid-1", {"asgi.scope": {"headers": []}})


@pytest.mark.asyncio
async def test_connect_emits_ok_and_snapshot(fake_redis):
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)
	namespace.emit = AsyncMock()

	await fake_redis.hset(
		"presence:user-1",
		mapping={
			"session_id": "session-1",
			"updated_at": str(int(time.time())),
			"lat": "0",
			"lon": "0",
			"radius_m": "15",
			"campus_id": "campus-1",
		},
	)

	token = "uid:user-1;campus:campus-1;sid:session-1"
	await namespace.trigger_event("connect", "sid-1", {"asgi.scope": _scope_with_authorization(token)})

	assert namespace.users["sid-1"]["user_id"] == "user-1"
	events = [call.args[0] for call in namespace.emit.await_args_list]
	assert "sys.ok" in events
	assert "presence.snapshot" in events


@pytest.mark.asyncio
async def test_presence_go_live_writes_presence(fake_redis):
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)
	namespace.emit = AsyncMock()

	token = "uid:user-1;campus:campus-1;sid:session-1"
	await namespace.trigger_event("connect", "sid-1", {"asgi.scope": _scope_with_authorization(token)})

	await namespace.trigger_event(
		"presence_go_live",
		"sid-1",
		{"lat": 10.0, "lon": 11.0, "radius_m": 5},
	)

	presence = await fake_redis.hgetall("presence:user-1")
	assert presence["lat"] == "10.0"
	assert presence["lon"] == "11.0"
	assert presence["radius_m"] == "15"  # floored to minimum search radius
	geo = await fake_redis.geopos("presence:campus:campus-1", "user-1")
	assert geo and geo[0][0] == pytest.approx(11.0)


@pytest.mark.asyncio
async def test_presence_update_rate_limit_emits_warning(fake_redis):
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)
	namespace.emit = AsyncMock()

	token = "uid:user-1;campus:campus-1;sid:session-1"
	await namespace.trigger_event("connect", "sid-1", {"asgi.scope": _scope_with_authorization(token)})

	for _ in range(10):
		await namespace.trigger_event(
			"presence_update",
			"sid-1",
			{"lat": 0.0, "lon": 0.0, "radius_m": 12},
		)

	namespace.emit.reset_mock()
	await namespace.trigger_event(
		"presence_update",
		"sid-1",
		{"lat": 0.0, "lon": 0.0},
	)

	assert namespace.emit.await_args_list[0].args[0] == "sys.warn"
	assert namespace.emit.await_args_list[0].args[1]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_nearby_request_returns_users_with_cursor(fake_redis):
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)
	namespace.emit = AsyncMock()

	current_time = str(int(time.time()))
	await fake_redis.hset(
		"presence:user-1",
		mapping={"session_id": "session-1", "updated_at": current_time, "lat": "0", "lon": "0", "radius_m": "20", "campus_id": "campus-1"},
	)
	await redis_client.geoadd("presence:campus:campus-1", {"user-1": (0.0, 0.0)})
	await fake_redis.hset(
		"presence:user-2",
		mapping={"session_id": "session-2", "updated_at": current_time, "lat": "0.0005", "lon": "0.0005", "radius_m": "20", "campus_id": "campus-1"},
	)
	await redis_client.geoadd("presence:campus:campus-1", {"user-2": (0.0005, 0.0005)})
	await fake_redis.hset(
		"presence:user-3",
		mapping={"session_id": "session-3", "updated_at": current_time, "lat": "0.001", "lon": "0.001", "radius_m": "20", "campus_id": "campus-1"},
	)
	await redis_client.geoadd("presence:campus:campus-1", {"user-3": (0.001, 0.001)})

	results = await redis_client.geosearch(
		"presence:campus:campus-1",
		longitude=0.0,
		latitude=0.0,
		radius=250,
		unit="m",
		withdist=True,
		sort="ASC",
	)
	assert len(results) >= 2

	token = "uid:user-1;campus:campus-1;sid:session-1"
	await namespace.trigger_event("connect", "sid-1", {"asgi.scope": _scope_with_authorization(token)})
	namespace.emit.reset_mock()

	await namespace.trigger_event(
		"nearby_request",
		"sid-1",
		{"lat": 0.0, "lon": 0.0, "limit": 1, "radius_m": 250},
	)

	event, payload = namespace.emit.await_args_list[-1].args
	assert event == "presence.nearby"
	assert len(payload["users"]) == 1
	assert payload["cursor"] is not None
