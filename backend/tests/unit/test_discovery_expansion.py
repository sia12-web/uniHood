import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from app.domain.discovery import service
from app.domain.discovery.schemas import DiscoveryFeedResponse
from app.infra.auth import AuthenticatedUser

@pytest.mark.asyncio
async def test_discovery_feed_enriched_with_expanded_fields(monkeypatch, fake_redis):
	user_id = str(uuid4())
	campus_id = str(uuid4())
	auth_user = AuthenticatedUser(id=user_id, campus_id=campus_id)
	
	target_user_id = uuid4()
	
	# Mock data for nearby user
	nearby_user = MagicMock()
	nearby_user.user_id = target_user_id
	nearby_user.display_name = "Enriched User"
	nearby_user.handle = "enriched"
	nearby_user.avatar_url = "http://avatar.com/1"
	nearby_user.major = "CS"
	nearby_user.graduation_year = 2025
	nearby_user.distance_m = 50.0
	nearby_user.gallery = []
	nearby_user.courses = []
	nearby_user.is_friend = False
	nearby_user.is_university_verified = True
	nearby_user.gender = "Male"
	nearby_user.birthday = "2000-01-01"
	nearby_user.hometown = "Hometown"
	nearby_user.languages = ["English"]
	nearby_user.relationship_status = "Single"
	nearby_user.sexual_orientation = "Straight"
	nearby_user.looking_for = ["Friends"]
	nearby_user.height = 180
	nearby_user.lifestyle = {"drinking": "No"}
	nearby_user.profile_prompts = [{"question": "Q", "answer": "A"}]
	
	async def fake_get_nearby(auth, query):
		return type("Resp", (), {"items": [nearby_user], "cursor": None})()
		
	monkeypatch.setattr(service, "get_nearby", fake_get_nearby)
	monkeypatch.setattr(service, "get_pool", AsyncMock(return_value=None)) # Not using DB for this part
	
	# Execute
	resp: DiscoveryFeedResponse = await service.list_feed(auth_user, cursor=None, limit=10)
	
	# Verify
	assert len(resp.items) == 1
	card = resp.items[0]
	assert card.display_name == "Enriched User"
	assert card.gender == "Male"
	assert card.hometown == "Hometown"
	assert card.height == 180
	# Age calculation (2000-01-01 to now should be 25ish)
	assert card.age is not None
	assert card.age >= 20
	assert card.lifestyle == {"drinking": "No"}
	assert card.top_prompts == [{"question": "Q", "answer": "A"}]
