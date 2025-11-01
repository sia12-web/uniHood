import pytest

from app.domain.search import models
from app.domain.search.service import reset_memory_state, seed_memory_store

USER_ME = "00000000-0000-0000-0000-000000000001"
USER_EVE = "00000000-0000-0000-0000-000000000002"
USER_PAL = "00000000-0000-0000-0000-000000000003"
ROOM_HANGOUT = "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_search_users_endpoint(api_client):
	await reset_memory_state()
	await seed_memory_store(
		users=[
			models.MemoryUser(
				user_id=USER_ME,
				handle="self",
				display_name="Self",
				campus_id="campus-x",
			),
			models.MemoryUser(
				user_id=USER_EVE,
				handle="eve",
				display_name="Eve Search",
				campus_id="campus-x",
			),
		],
	)

	response = await api_client.get(
		"/search/users",
		params={"q": "eve"},
		headers={"X-User-Id": USER_ME, "X-Campus-Id": "campus-x"},
	)
	payload = response.json()
	assert response.status_code == 200
	assert payload["items"][0]["user_id"] == USER_EVE
	assert payload["items"][0]["score"] > 0


@pytest.mark.asyncio
async def test_discover_rooms_endpoint(api_client):
	await reset_memory_state()
	await seed_memory_store(
		users=[
			models.MemoryUser(
				user_id=USER_ME,
				handle="self",
				display_name="Self",
				campus_id="campus-y",
			),
			models.MemoryUser(
				user_id=USER_PAL,
				handle="pal",
				display_name="Pal",
				campus_id="campus-y",
			),
		],
		friendships=[(USER_ME, USER_PAL), (USER_PAL, USER_ME)],
		rooms=[
			models.MemoryRoom(
				room_id=ROOM_HANGOUT,
				name="Campus Hangout",
				preset="12+",
				campus_id="campus-y",
				visibility="link",
				member_ids={USER_ME, USER_PAL},
				messages_24h=8,
			),
		],
	)

	response = await api_client.get(
		"/discover/rooms",
		headers={"X-User-Id": USER_ME, "X-Campus-Id": "campus-y"},
	)
	payload = response.json()
	assert response.status_code == 200
	assert payload["items"][0]["room_id"] == ROOM_HANGOUT
	assert payload["items"][0]["score"] > 0
