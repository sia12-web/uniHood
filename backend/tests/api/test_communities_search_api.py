import pytest

from app.communities.api import search as search_api, typeahead as typeahead_api
from app.communities.schemas import dto
from app.communities.search import exceptions as search_exceptions

HEADERS = {"X-User-Id": "user-1", "X-Campus-Id": "campus-1"}


@pytest.mark.asyncio
async def test_search_groups_endpoint(monkeypatch, api_client):
	class _StubService:
		async def search_groups(self, auth_user, *, query: str, limit: int):
			return dto.GroupSearchResponse(
				items=[
					dto.GroupSearchResult(
						id="group-1",
						name="Club",
						slug="club",
						description="",
						tags=[],
						score=1.2,
						source="stub",
					)
				],
				backend="stub",
				took_ms=2,
			)

	monkeypatch.setattr(search_api, "_service", _StubService())
	response = await api_client.get("/api/communities/v1/search/groups", params={"q": "club"}, headers=HEADERS)
	assert response.status_code == 200
	payload = response.json()
	assert payload["backend"] == "stub"
	assert payload["items"][0]["name"] == "Club"


@pytest.mark.asyncio
async def test_search_groups_error_translation(monkeypatch, api_client):
	class _FailingService:
		async def search_groups(self, auth_user, *, query: str, limit: int):
			raise search_exceptions.QueryValidationError("query_too_short")

	monkeypatch.setattr(search_api, "_service", _FailingService())
	response = await api_client.get("/api/communities/v1/search/groups", params={"q": ""}, headers=HEADERS)
	assert response.status_code == 422


@pytest.mark.asyncio
async def test_typeahead_groups_endpoint(monkeypatch, api_client):
	class _StubService:
		async def typeahead_groups(self, auth_user, *, query: str, limit: int):
			return dto.GroupTypeaheadResponse(
				items=[
					dto.GroupSearchResult(
						id="group-2",
						name="Typing",
						slug="typing",
						description="",
						tags=[],
						score=None,
						source="stub",
					)
				],
				backend="stub",
				took_ms=1,
			)

	monkeypatch.setattr(typeahead_api, "_service", _StubService())
	response = await api_client.get("/api/communities/v1/typeahead/groups", params={"q": "ty"}, headers=HEADERS)
	assert response.status_code == 200
	assert response.json()["items"][0]["slug"] == "typing"
