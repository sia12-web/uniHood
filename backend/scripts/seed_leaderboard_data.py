#!/usr/bin/env python
"""Seed leaderboard data for development/testing.

This script creates fake activity data in Redis so the leaderboard page
shows sample entries during development.

Usage:
    cd backend
    python scripts/seed_leaderboard_data.py
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import random
from datetime import datetime, timezone
from uuid import UUID

from app.infra.redis import redis_client
from app.domain.leaderboards.accrual import LeaderboardAccrual, cache_user_campus


# McGill campus ID
CAMPUS_ID = "c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2"

# Demo user ID
DEMO_USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

# Generate some fake user IDs for variety
FAKE_USERS = [
    DEMO_USER_ID,
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "dddddddd-dddd-dddd-dddd-dddddddddddd",
    "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
]


async def seed_activity_data():
    """Seed fake activity data into Redis for leaderboard testing."""
    accrual = LeaderboardAccrual()
    
    print("Seeding leaderboard data...")
    
    # Cache campus for all users
    for user_id in FAKE_USERS:
        await cache_user_campus(user_id, CAMPUS_ID)
    
    # Simulate some DMs between users
    print("  - Adding DM activity...")
    for _ in range(15):
        sender = random.choice(FAKE_USERS)
        recipient = random.choice([u for u in FAKE_USERS if u != sender])
        await accrual.record_dm_sent(from_user_id=sender, to_user_id=recipient)
    
    # Simulate some game activities
    print("  - Adding game activity...")
    for _ in range(10):
        players = random.sample(FAKE_USERS, 2)
        winner = random.choice(players)
        await accrual.record_activity_ended(
            user_ids=players,
            winner_id=winner,
            duration_seconds=random.randint(30, 300),
            move_count=random.randint(5, 20),
        )
    
    # Simulate some room/meetup creation
    print("  - Adding meetup activity...")
    for i, user_id in enumerate(random.sample(FAKE_USERS, 4)):
        await accrual.record_room_created(user_id=user_id, room_id=f"room-{i}")
    
    # Simulate some room joins
    print("  - Adding room join activity...")
    for i in range(6):
        joiner = random.choice(FAKE_USERS)
        await accrual.record_room_joined(user_id=joiner, room_id=f"room-{i % 4}")
        # Simulate staying for a while (for anti-cheat validation)
        await accrual.record_room_left(user_id=joiner, room_id=f"room-{i % 4}")
    
    print("Activity data seeded.")
    
    # Now trigger the snapshot computation
    print("Computing leaderboard snapshot...")
    from app.domain.leaderboards.service import LeaderboardService
    service = LeaderboardService()
    await service.compute_daily_snapshot()
    print("Snapshot computed!")
    
    # Show what we have
    from app.domain.leaderboards.models import LeaderboardPeriod, LeaderboardScope
    result = await service.get_leaderboard(
        scope=LeaderboardScope.OVERALL,
        period=LeaderboardPeriod.DAILY,
        campus_id=UUID(CAMPUS_ID),
    )
    print(f"\nLeaderboard has {len(result.items)} entries:")
    for row in result.items[:5]:
        print(f"  #{row.rank}: {row.user_id} - {row.score} pts")
    if len(result.items) > 5:
        print(f"  ... and {len(result.items) - 5} more")


async def main():
    try:
        await seed_activity_data()
        print("\nDone! Refresh the leaderboard page to see the data.")
    finally:
        await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
