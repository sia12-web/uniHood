
import asyncio
import sys
import os
from unittest.mock import MagicMock

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.domain.analytics import schemas
from app.domain.analytics import api
from app.domain.analytics.service import AnalyticsService
from app.infra.auth import AuthenticatedUser

# Mock Service
async def mock_get_overview(self):
    return schemas.AnalyticsOverview(
        total_meetups_created=101,
        total_games_played=202,
        active_meetups_count=5,
        active_games_count=2
    )

async def mock_get_popular_games(self, limit=5):
    return [schemas.PopularGameItem(game_kind="chess", play_count=10, last_played_at=None)]

async def mock_get_popular_meetup_types(self, limit=5):
    return [schemas.PopularMeetupTypeItem(category="study", count=30)]

async def mock_get_recent_activity(self, limit=20):
    from datetime import datetime
    return [schemas.ActivityLogItem(
        id=1, user_id="u1", event="test", meta={}, created_at=datetime.now(), user_display_name="Test"
    )]

# Patch Service
AnalyticsService.get_overview = mock_get_overview
AnalyticsService.get_popular_games = mock_get_popular_games
AnalyticsService.get_popular_meetup_types = mock_get_popular_meetup_types
AnalyticsService.get_recent_activity = mock_get_recent_activity

# Mock User
admin_user = AuthenticatedUser(
    id="admin-id",
    campus_id="campus-id",
    roles=("admin",),
    display_name="Admin",
    handle="admin"
)

async def run_checks():
    print("Running Analytics API Checks...")
    
    # Check Overview
    print("Checking get_overview...", end="")
    res = await api.get_overview(user=admin_user)
    assert res.total_meetups_created == 101
    assert res.total_games_played == 202
    print(" OK")

    # Check Popular Games
    print("Checking get_popular_games...", end="")
    res = await api.get_popular_games(limit=5, user=admin_user)
    assert len(res) == 1
    assert res[0].game_kind == "chess"
    print(" OK")

    # Check Popular Meetups
    print("Checking get_popular_meetup_types...", end="")
    res = await api.get_popular_meetup_types(limit=5, user=admin_user)
    assert len(res) == 1
    assert res[0].count == 30
    print(" OK")

    # Check Activity Log
    print("Checking get_activity_log...", end="")
    res = await api.get_activity_log(limit=20, user=admin_user)
    assert len(res) == 1
    assert res[0].user_id == "u1"
    print(" OK")

    print("\nALL CHECKS PASSED")

if __name__ == "__main__":
    asyncio.run(run_checks())
