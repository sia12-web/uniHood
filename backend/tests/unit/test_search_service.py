import time

import pytest
import pytest_asyncio

from app.domain.search import models, schemas
from app.domain.search.service import SearchService, reset_memory_state, seed_memory_store
from app.infra.auth import AuthenticatedUser


USER_ME = "00000000-0000-0000-0000-000000000010"
USER_ALICE = "00000000-0000-0000-0000-000000000011"
USER_BOB = "00000000-0000-0000-0000-000000000012"
USER_CAROL = "00000000-0000-0000-0000-000000000013"
USER_NINA = "00000000-0000-0000-0000-000000000014"
USER_OTTO = "00000000-0000-0000-0000-000000000015"
USER_ALLY = "00000000-0000-0000-0000-000000000016"
USER_FRIEND = "00000000-0000-0000-0000-000000000017"
ROOM_A = "11111111-1111-1111-1111-111111111111"
ROOM_B = "22222222-2222-2222-2222-222222222222"


@pytest_asyncio.fixture(autouse=True)
async def clear_memory_state():
	await reset_memory_state()
	yield
	await reset_memory_state()


@pytest.mark.asyncio
async def test_search_users_respects_privacy_and_blocks():
	service = SearchService()
	now = time.time()
	await seed_memory_store(
		users=[
			models.MemoryUser(
				user_id=USER_ME,
				handle="myself",
				display_name="Primary User",
				campus_id="campus-a",
				visibility="everyone",
			),
			models.MemoryUser(
				user_id=USER_ALICE,
				handle="alice",
				display_name="Alice Wonder",
				campus_id="campus-a",
				visibility="everyone",
				last_seen_ts=now,
			),
			models.MemoryUser(
				user_id=USER_BOB,
				handle="bobby",
				display_name="Bob Hidden",
				campus_id="campus-a",
				ghost_mode=True,
			),
			models.MemoryUser(
				user_id=USER_CAROL,
				handle="carol",
				display_name="Carol Friends",
				campus_id="campus-a",
				visibility="friends",
			),
		],
		friendships=[(USER_ME, USER_ALICE), (USER_ALICE, USER_ME)],
		blocks=[(USER_ME, USER_CAROL)],
	)

	auth_user = AuthenticatedUser(id=USER_ME, campus_id="campus-a")
	response = await service.search_users(auth_user, schemas.SearchUsersQuery(q="ali", limit=5))

	assert [str(item.user_id) for item in response.items] == [USER_ALICE]
	assert response.cursor is None
	assert response.items[0].score > 0


@pytest.mark.asyncio
async def test_discover_people_prioritises_mutuals_and_recency():
	service = SearchService()
	now = time.time()
	await seed_memory_store(
		users=[
			models.MemoryUser(
				user_id=USER_ME,
				handle="self",
				display_name="Self",
				campus_id="campus-b",
				visibility="everyone",
				location_bucket="quad",
			),
			models.MemoryUser(
				user_id=USER_NINA,
				handle="nina",
				display_name="Nina Mutual",
				campus_id="campus-b",
				visibility="everyone",
				last_seen_ts=now,
				location_bucket="quad",
			),
			models.MemoryUser(
				user_id=USER_OTTO,
				handle="otto",
				display_name="Otto Quiet",
				campus_id="campus-b",
				visibility="everyone",
				last_seen_ts=now - 7200,
			),
		],
		friendships=[
			(USER_ME, USER_ALLY),
			(USER_ALLY, USER_ME),
			(USER_NINA, USER_ALLY),
			(USER_ALLY, USER_NINA),
		],
	)

	auth_user = AuthenticatedUser(id=USER_ME, campus_id="campus-b")
	response = await service.discover_people(auth_user, schemas.DiscoverPeopleQuery(limit=5))

	user_ids = [str(item.user_id) for item in response.items]
	assert USER_NINA in user_ids
	assert USER_OTTO in user_ids
	assert user_ids.index(USER_NINA) < user_ids.index(USER_OTTO)


@pytest.mark.asyncio
async def test_discover_rooms_computes_scores_and_pagination():
	service = SearchService()
	await seed_memory_store(
		users=[
			models.MemoryUser(
				user_id=USER_ME,
				handle="self",
				display_name="Self",
				campus_id="campus-c",
			),
			models.MemoryUser(
				user_id=USER_FRIEND,
				handle="friend",
				display_name="Friend",
				campus_id="campus-c",
			),
		],
		friendships=[(USER_ME, USER_FRIEND), (USER_FRIEND, USER_ME)],
		rooms=[
			models.MemoryRoom(
				room_id=ROOM_A,
				name="Study Group",
				preset="4-6",
				campus_id="campus-c",
				visibility="link",
				member_ids={USER_ME, USER_FRIEND, "x1"},
				messages_24h=12,
			),
			models.MemoryRoom(
				room_id=ROOM_B,
				name="Dorm Chat",
				preset="12+",
				campus_id="campus-c",
				visibility="link",
				member_ids={"x1", "x2"},
				messages_24h=2,
			),
		],
	)

	auth_user = AuthenticatedUser(id=USER_ME, campus_id="campus-c")
	response = await service.discover_rooms(auth_user, schemas.DiscoverRoomsQuery(limit=1))

	assert [str(item.room_id) for item in response.items] == [ROOM_A]
	assert response.cursor is not None
	next_page = await service.discover_rooms(
		auth_user,
		schemas.DiscoverRoomsQuery(limit=1, cursor=response.cursor),
	)
	assert [str(item.room_id) for item in next_page.items] == [ROOM_B]
