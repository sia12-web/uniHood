import asyncio
import os
import sys
import uuid
import httpx
from datetime import datetime, timedelta

# Ensure backend path is in sys.path
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))
else:
    sys.path.append(os.getcwd())

from app.main import app
from app.infra.postgres import get_pool
from app.settings import settings

async def main():
    print("🚀 Starting Review Flow Test...")
    
    # 1. Setup Data
    pool = await get_pool()
    host_id = str(uuid.uuid4())
    guest_id = str(uuid.uuid4())
    campus_id = str(uuid.uuid4()) # Will be overwritten if real one exists
    
    async with pool.acquire() as conn:
        cid = await conn.fetchval("SELECT id FROM campuses LIMIT 1")
        if cid:
            campus_id = str(cid)
        else:
            print("❌ No campus found in DB. Please create a campus first.")
            return

        print(f"Phase 1: Creating Users (Host: {host_id[:8]}, Guest: {guest_id[:8]})")
        
        # Create Host
        await conn.execute("""
            INSERT INTO users (id, email, handle, display_name, campus_id, created_at, updated_at, email_verified, privacy, status, password_hash)
            VALUES ($1, $2, $3, 'Host User', $4, NOW(), NOW(), true, '{}', '{}', 'hash')
            ON CONFLICT (id) DO NOTHING
        """, host_id, f"host_{host_id[:4]}@test.com", f"host_{host_id[:4]}", campus_id)
        
        # Create Guest
        await conn.execute("""
            INSERT INTO users (id, email, handle, display_name, campus_id, created_at, updated_at, email_verified, privacy, status, password_hash)
            VALUES ($1, $2, $3, 'Guest User', $4, NOW(), NOW(), true, '{}', '{}', 'hash')
            ON CONFLICT (id) DO NOTHING
        """, guest_id, f"guest_{guest_id[:4]}@test.com", f"guest_{guest_id[:4]}", campus_id)

        # Create Past Meetup
        meetup_id = str(uuid.uuid4())
        print(f"Phase 2: Creating Past Meetup {meetup_id[:8]}")
        start_at = datetime.now() - timedelta(days=2)
        end_at = datetime.now() - timedelta(days=1)
        
        await conn.execute("""
            INSERT INTO meetups (id, creator_id, campus_id, title, description, location, start_at, end_at, category, visibility, status)
            VALUES ($1, $2, $3, 'Past Event', 'Review me', 'Quad', $4, $5, 'social', 'public', 'ENDED')
        """, meetup_id, host_id, campus_id, start_at, end_at)

        # Join Guest
        await conn.execute("""
            INSERT INTO meetup_participants (meetup_id, user_id, role, status)
            VALUES ($1, $2, 'attendee', 'joined')
        """, meetup_id, guest_id)

    # 2. Test API
    print("Phase 3: Testing Review API")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # A. Guest reviews Meetup (Event only)
        # Using X-User-Id auth bypass (Dev mode)
        headers = {"X-User-Id": guest_id, "X-Campus-Id": campus_id}
        
        resp = await client.post(f"/meetups/{meetup_id}/reviews", json={
            "rating": 5,
            "content": "Great event!"
        }, headers=headers)
        
        if resp.status_code == 200:
            print("✅ Guest reviewed Meetup (Status 200)")
        else:
            print(f"❌ Failed to review meetup: {resp.text}")
            return

        # B. Guest reviews Host (Participant)
        resp = await client.post(f"/meetups/{meetup_id}/reviews", json={
            "rating": 4,
            "content": "Good host",
            "target_user_id": host_id
        }, headers=headers)
        
        if resp.status_code == 200:
            print("✅ Guest reviewed Host (Status 200)")
        else:
            print(f"❌ Failed to review host: {resp.text}")
            return

    # 3. Verify Reputation
    print("Phase 4: Verifying Reputation Score")
    async with pool.acquire() as conn:
        host = await conn.fetchrow("SELECT reputation_score, review_count FROM users WHERE id = $1", host_id)
        if host:
            score = host['reputation_score']
            count = host['review_count']
            if score == 4.0 and count == 1:
                print(f"✅ Reputation Verified! Score: {score}, Count: {count}")
            else:
                print(f"❌ Reputation Verification Failed. Expected 4.0/1. Got: Score {score}, Count {count}")
        else:
            print(f"❌ Reputation Verification Failed. Host not found.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
