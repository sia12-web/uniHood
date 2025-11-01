import pytest
import socketio

from app.domain.proximity.sockets import PresenceNamespace


@pytest.mark.asyncio
async def test_connect_requires_headers():
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)

	with pytest.raises(ConnectionRefusedError):
		await namespace.trigger_event("connect", "sid-1", {"asgi.scope": {"headers": []}})


@pytest.mark.asyncio
async def test_subscribe_tracks_rooms():
	server = socketio.AsyncServer(async_mode="asgi")
	namespace = PresenceNamespace()
	server.register_namespace(namespace)

	scope = {
		"headers": [(b"x-user-id", b"user-a"), (b"x-campus-id", b"campus-a")],
	}
	await namespace.trigger_event("connect", "sid-42", {"asgi.scope": scope})
	await namespace.trigger_event(
		"nearby_subscribe",
		"sid-42",
		{"campus_id": "campus-a", "radius_m": 50},
	)

	assert ("campus-a", 50) in namespace._subscriptions["sid-42"]

	await namespace.trigger_event(
		"nearby_unsubscribe",
		"sid-42",
		{"campus_id": "campus-a", "radius_m": 50},
	)

	assert namespace._subscriptions["sid-42"] == set()
