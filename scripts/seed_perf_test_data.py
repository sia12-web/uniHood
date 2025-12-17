#!/usr/bin/env python3
"""
Performance Test Data Seeder

Creates deterministic test data for performance testing.
IDs are fixed so URLs are stable and repeatable across runs.

Run: python scripts/seed_perf_test_data.py
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.infra.postgres import get_pool

# ============================================================================
# FIXED IDS - Must match frontend/scripts/perf-inventory.js PERF_TEST_DATA
# ============================================================================
PERF_TEST_DATA = {
    # User profiles
    "user_id": "01HPERFTEST000000000000001",
    "handle": "perf-test-user",
    "email": "perf-test@example.com",
    
    # Second user for chat/interactions
    "peer_user_id": "01HPERFTEST000000000000002",
    "peer_handle": "perf-test-peer",
    "peer_email": "perf-peer@example.com",
    
    # Chat thread (using peer_user_id as thread id for DM)
    "chat_thread_id": "01HPERFTEST000000000000002",  # Same as peer for DM lookup
    
    # Meetup
    "meetup_id": "01HPERFTEST000000000000003",
    
    # Room
    "room_id": "01HPERFTEST000000000000004",
    
    # Community group
    "group_id": "01HPERFTEST000000000000005",
    
    # Community event
    "event_id": "01HPERFTEST000000000000006",
    
    # Moderation case (admin)
    "case_id": "01HPERFTEST000000000000007",
    
    # Campus
    "campus_id": "01HPERFTEST0CAMPUS00000001",
}

# Password hash for "PerfTest123!" - bcrypt
# You may need to generate this with: python -c "import bcrypt; print(bcrypt.hashpw(b'PerfTest123!', bcrypt.gensalt()).decode())"
PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4dWxQAGdmRkXp1K6"


async def seed_perf_data():
    """Seed all performance test data with fixed IDs."""
    print("🚀 Seeding performance test data...")
    
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        # 1. Create campus
        print("  Creating campus...")
        await conn.execute("""
            INSERT INTO campuses (id, name, domain, lat, lon)
            VALUES ($1, 'Perf Test University', 'perftest.edu', 45.5017, -73.5673)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        """, PERF_TEST_DATA["campus_id"])
        
        # 2. Create primary perf test user
        print("  Creating perf-test-user...")
        await conn.execute("""
            INSERT INTO users (
                id, handle, display_name, email, password_hash,
                campus_id, major, graduation_year, bio,
                email_verified, onboarding_complete, privacy
            )
            VALUES (
                $1, $2, 'Perf Test User', $3, $4,
                $5, 'Computer Science', 2025, 'Performance testing account',
                true, true, '{"visibility":"everyone","blur_distance_m":10}'
            )
            ON CONFLICT (id) DO UPDATE SET
                handle = EXCLUDED.handle,
                email = EXCLUDED.email
        """, 
            PERF_TEST_DATA["user_id"],
            PERF_TEST_DATA["handle"],
            PERF_TEST_DATA["email"],
            PASSWORD_HASH,
            PERF_TEST_DATA["campus_id"]
        )
        
        # 3. Create peer user (for chat)
        print("  Creating perf-test-peer...")
        await conn.execute("""
            INSERT INTO users (
                id, handle, display_name, email, password_hash,
                campus_id, major, graduation_year, bio,
                email_verified, onboarding_complete, privacy
            )
            VALUES (
                $1, $2, 'Perf Test Peer', $3, $4,
                $5, 'Engineering', 2025, 'Peer for performance testing',
                true, true, '{"visibility":"everyone","blur_distance_m":10}'
            )
            ON CONFLICT (id) DO UPDATE SET
                handle = EXCLUDED.handle,
                email = EXCLUDED.email
        """,
            PERF_TEST_DATA["peer_user_id"],
            PERF_TEST_DATA["peer_handle"],
            PERF_TEST_DATA["peer_email"],
            PASSWORD_HASH,
            PERF_TEST_DATA["campus_id"]
        )
        
        # 4. Create meetup
        print("  Creating meetup...")
        meetup_time = datetime.now() + timedelta(days=7)
        await conn.execute("""
            INSERT INTO meetups (
                id, creator_id, title, description,
                location_name, lat, lon,
                scheduled_at, max_attendees, campus_id
            )
            VALUES (
                $1, $2, 'Perf Test Meetup', 'A meetup for performance testing',
                'Test Location', 45.5017, -73.5673,
                $3, 10, $4
            )
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
        """,
            PERF_TEST_DATA["meetup_id"],
            PERF_TEST_DATA["user_id"],
            meetup_time,
            PERF_TEST_DATA["campus_id"]
        )
        
        # 5. Create room
        print("  Creating room...")
        await conn.execute("""
            INSERT INTO rooms (
                id, name, description, creator_id,
                max_participants, campus_id, is_public
            )
            VALUES (
                $1, 'Perf Test Room', 'A room for performance testing',
                $2, 20, $3, true
            )
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        """,
            PERF_TEST_DATA["room_id"],
            PERF_TEST_DATA["user_id"],
            PERF_TEST_DATA["campus_id"]
        )
        
        # 6. Create community group
        print("  Creating community group...")
        await conn.execute("""
            INSERT INTO community_groups (
                id, name, description, creator_id,
                campus_id, is_public, member_count
            )
            VALUES (
                $1, 'Perf Test Group', 'A group for performance testing',
                $2, $3, true, 1
            )
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        """,
            PERF_TEST_DATA["group_id"],
            PERF_TEST_DATA["user_id"],
            PERF_TEST_DATA["campus_id"]
        )
        
        # 7. Create community event
        print("  Creating community event...")
        event_time = datetime.now() + timedelta(days=14)
        await conn.execute("""
            INSERT INTO community_events (
                id, group_id, title, description,
                creator_id, scheduled_at, location_name
            )
            VALUES (
                $1, $2, 'Perf Test Event', 'An event for performance testing',
                $3, $4, 'Test Venue'
            )
            ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
        """,
            PERF_TEST_DATA["event_id"],
            PERF_TEST_DATA["group_id"],
            PERF_TEST_DATA["user_id"],
            event_time
        )
        
        # 8. Add user to group
        print("  Adding user to group...")
        await conn.execute("""
            INSERT INTO community_group_members (group_id, user_id, role)
            VALUES ($1, $2, 'admin')
            ON CONFLICT (group_id, user_id) DO NOTHING
        """,
            PERF_TEST_DATA["group_id"],
            PERF_TEST_DATA["user_id"]
        )
        
    print("✅ Performance test data seeded successfully!")
    print(f"""
Test credentials:
  Email: {PERF_TEST_DATA['email']}
  Password: PerfTest123!
  Handle: {PERF_TEST_DATA['handle']}

Fixed URLs for testing:
  /u/{PERF_TEST_DATA['handle']}
  /chat/{PERF_TEST_DATA['chat_thread_id']}
  /meetups/{PERF_TEST_DATA['meetup_id']}
  /rooms/{PERF_TEST_DATA['room_id']}
  /communities/groups/{PERF_TEST_DATA['group_id']}
  /communities/events/{PERF_TEST_DATA['event_id']}
""")


async def main():
    try:
        await seed_perf_data()
    except Exception as e:
        print(f"❌ Error seeding data: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
