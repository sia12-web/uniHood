
import pytest
from httpx import AsyncClient
from app.main import app
from app.domain.analytics.api import require_admin
from app.domain.analytics.service import AnalyticsService
from app.domain.analytics import schemas
from app.infra.auth import AuthenticatedUser
from unittest.mock import MagicMock

@pytest.fixture
def mock_admin_user():
    return AuthenticatedUser(
        id="00000000-0000-0000-0000-000000000000",
        campus_id="c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2", # McGill
        roles=("admin",),
        display_name="Admin User",
        handle="admin",
    )

@pytest.fixture
def override_dependency(mock_admin_user):
    app.dependency_overrides[require_admin] = lambda: mock_admin_user
    yield
    app.dependency_overrides.pop(require_admin, None)

@pytest.fixture
def mock_analytics_service(monkeypatch):
    mock = MagicMock(spec=AnalyticsService)
    
    async def _get_overview():
        return schemas.AnalyticsOverview(
            total_meetups_created=100,
            total_games_played=500,
            active_meetups_count=10,
            active_games_count=5
        )
    mock.get_overview.side_effect = _get_overview

    async def _get_popular_games(limit=5):
        return [schemas.PopularGameItem(game_kind="chess", play_count=10, last_played_at=None)]
    mock.get_popular_games.side_effect = _get_popular_games

    async def _get_popular_meetup_types(limit=5):
        return [schemas.PopularMeetupTypeItem(category="study", count=20)]
    mock.get_popular_meetup_types.side_effect = _get_popular_meetup_types

    async def _get_recent_activity(limit=20):
        # Using a fixed date or string for simplicity if schema allows, but schema has datetime
        from datetime import datetime
        return [schemas.ActivityLogItem(
            id=1, user_id="u1", event="test", meta={}, created_at=datetime.now(), user_display_name="Test"
        )]
    mock.get_recent_activity.side_effect = _get_recent_activity

    monkeypatch.setattr("app.domain.analytics.service.AnalyticsService", lambda: mock)
    return mock

@pytest.mark.asyncio
async def test_admin_analytics_overview(api_client: AsyncClient, override_dependency, mock_analytics_service):
    response = await api_client.get("/admin/analytics/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_meetups_created"] == 100
    assert data["total_games_played"] == 500

@pytest.mark.asyncio
async def test_admin_analytics_popular_games(api_client: AsyncClient, override_dependency, mock_analytics_service):
    response = await api_client.get("/admin/analytics/games/popular?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["game_kind"] == "chess"
    # Verify mock was called with correct params
    # Note: mocking class instantiation usually returns the mock, but we patched the class to return a mock
    # verifying call args is tricky with async side_effects on methods, but we verified the response

@pytest.mark.asyncio
async def test_admin_analytics_popular_meetups(api_client: AsyncClient, override_dependency, mock_analytics_service):
    response = await api_client.get("/admin/analytics/meetups/popular-types")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["category"] == "study"

@pytest.mark.asyncio
async def test_admin_analytics_activity_log(api_client: AsyncClient, override_dependency, mock_analytics_service):
    response = await api_client.get("/admin/analytics/activity-log")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["user_id"] == "u1"

@pytest.mark.asyncio
async def test_admin_analytics_forbidden_without_auth(api_client: AsyncClient):
    # Ensure no override is active (it's yielded fixtures in other tests, but here we run without it)
    # app.dependency_overrides should be clear if we don't use the fixture
    # But wait, we need to ensure the client request DOES NOT maintain state.
    # The fixture uses yield, cleaning up after itself.
    
    # We DO generally need a user for "get_current_user" even if not admin, or it returns 401.
    # If we provide NO headers, it should be 401 Unauthorized.
    response = await api_client.get("/admin/analytics/overview")
    assert response.status_code in (401, 403)
