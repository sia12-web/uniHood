import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from app.domain.identity import profile_service, schemas
from app.infra.auth import AuthenticatedUser

@pytest.mark.asyncio
async def test_patch_profile_expanded_fields(monkeypatch, fake_redis):
	user_id = str(uuid4())
	campus_id = str(uuid4())
	auth_user = AuthenticatedUser(id=user_id, campus_id=campus_id)
	
	# Mock data
	mock_record = {
		"id": user_id,
		"email": "test@unihood.com",
		"email_verified": True,
		"handle": "tester",
		"display_name": "Tester",
		"bio": "Bio",
		"campus_id": campus_id,
		"privacy": {},
		"status": {},
		"password_hash": "hash",
		"major": "CS",
		"graduation_year": 2025,
		"passions": ["Coding"],
		"profile_gallery": [],
		"social_links": {},
		"lat": 0.0,
		"lon": 0.0,
		"ten_year_vision": "Rich",
		"gender": "Non-binary",
		"birthday": "2000-01-01",
		"hometown": "Tech City",
		"languages": ["Python", "English"],
		"relationship_status": "Single",
		"sexual_orientation": "Straight",
		"looking_for": ["Friends"],
		"height": 180,
		"lifestyle": {"drinking": "Socially"},
		"profile_prompts": [{"question": "Fav language?", "answer": "Python"}]
	}

	# Mock dependencies
	mock_pool = MagicMock()
	mock_conn = AsyncMock()
	mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
	
	# Mock transaction context manager
	mock_conn.transaction = MagicMock()
	mock_conn.transaction.return_value.__aenter__ = AsyncMock(return_value=None)
	mock_conn.transaction.return_value.__aexit__ = AsyncMock(return_value=None)
	
	monkeypatch.setattr("app.infra.postgres.get_pool", AsyncMock(return_value=mock_pool))
	monkeypatch.setattr(profile_service, "get_pool", AsyncMock(return_value=mock_pool))
	monkeypatch.setattr(profile_service, "_invalidate_profile_cache", AsyncMock())
	
	# Mock fetchrow for _load_user and others
	mock_conn.fetchrow.return_value = mock_record
	mock_conn.fetchval.return_value = True # for campus check
	
	# Mock Redis for cache invalidation
	monkeypatch.setattr("app.infra.redis.redis_client", fake_redis)

	# Mock courses_service.get_user_courses to avoid hitting real DB or other mocks
	from app.domain.identity import courses as courses_service
	monkeypatch.setattr(courses_service, "get_user_courses", AsyncMock(return_value=[]))
	monkeypatch.setattr(courses_service, "set_user_courses", AsyncMock())

	# Patch payload
	payload = schemas.ProfilePatch(
		gender="Male",
		hometown="New Town",
		lifestyle={"smoking": "No"},
		profile_prompts=[{"question": "Vibe?", "answer": "Chill"}]
	)

	# Execute
	profile = await profile_service.patch_profile(auth_user, payload)

	# Verify
	assert profile.gender == "Male"
	assert profile.hometown == "New Town"
	assert profile.lifestyle == {"smoking": "No"}
	assert profile.profile_prompts == [{"question": "Vibe?", "answer": "Chill"}]
	
	# Verify SQL call (optional but good)
	# Check if the last execute call included the new fields
	last_call = mock_conn.execute.call_args_list[-1]
	args = last_call.args
	# Values are $15, $17, $23, $24 for gender, hometown, lifestyle, profile_prompts
	# args[0] is SQL, so $1 is args[1], $15 is args[15]
	assert args[15] == "Male"
	assert args[17] == "New Town"
	import json
	assert json.loads(args[23]) == {"smoking": "No"}
	assert json.loads(args[24]) == [{"question": "Vibe?", "answer": "Chill"}]

@pytest.mark.asyncio
async def test_get_profile_expanded_fields(monkeypatch, fake_redis):
	user_id = str(uuid4())
	campus_id = str(uuid4())
	
	mock_record = {
		"id": user_id,
		"email": "test@unihood.com",
		"email_verified": True,
		"handle": "tester",
		"display_name": "Tester",
		"campus_id": campus_id,
		"gender": "Female",
		"birthday": "1999-12-31",
		"hometown": "Old Town",
		"height": 165
	}

	mock_pool = MagicMock()
	mock_conn = AsyncMock()
	mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
	
	monkeypatch.setattr("app.infra.postgres.get_pool", AsyncMock(return_value=mock_pool))
	monkeypatch.setattr(profile_service, "get_pool", AsyncMock(return_value=mock_pool))
	mock_conn.fetchrow.return_value = mock_record
	monkeypatch.setattr("app.infra.redis.redis_client", fake_redis)

	from app.domain.identity import courses as courses_service
	monkeypatch.setattr(courses_service, "get_user_courses", AsyncMock(return_value=[]))

	# Execute
	profile = await profile_service.get_profile(user_id)

	# Verify
	assert profile.gender == "Female"
	assert profile.hometown == "Old Town"
	assert profile.height == 165
