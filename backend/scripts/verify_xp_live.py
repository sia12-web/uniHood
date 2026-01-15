"""Live verification of ALL XP Actions."""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timedelta

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from app.domain.identity import profile_service, schemas as identity_schemas
from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction
from app.domain.social import service as social_service
from app.domain.meetups import service as meetup_service
from app.domain.meetups.schemas import MeetupCreateRequest, MeetupVisibility, MeetupCategory
from app.infra.postgres import init_pool, close_pool
from app.infra.auth import AuthenticatedUser

async def verify_actions():
    print("Starting LIVE XP Verification...")
    
    pool = await init_pool()
    xp_service = XPService()
    meetup_svc = meetup_service.MeetupService()
    # social_service is a module, no instantiation needed
    
    # 1. Setup Test User
    user_id = uuid4()
    campus_id = uuid4() # Dummy campus
    
    # Create campus first to avoid FK errors
    domain_suffix = str(uuid4())[:8]
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO campuses (id, name, domain, lat, lon)
            VALUES ($1::uuid, 'XP Test Campus', 'xp_' || $2 || '.edu', 0, 0)
            ON CONFLICT (id) DO NOTHING
        """, str(campus_id), domain_suffix)
    
    auth_user = AuthenticatedUser(
        id=str(user_id),
        campus_id=str(campus_id)
    )
    
    user_email = f"xp_test_{user_id}@xp.edu"
    
    print(f"Creating test user {user_id}...")
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (id, handle, display_name, email, campus_id, updated_at) 
            VALUES ($1::uuid, 'xptest_' || substr($1::text, 1, 8), 'XP Tester', $2, $3::uuid, NOW())
            ON CONFLICT (id) DO NOTHING
        """, str(user_id), user_email, str(campus_id))

    # Helper to check XP
    async def check_xp(expected_total, step_name):
        stats = await xp_service.get_user_stats(user_id)
        if stats.total_xp == expected_total:
            print(f"[OK] {step_name} Verified! (Total: {stats.total_xp})")
            return True
        else:
            print(f"[FAIL] {step_name} FAILED! Expected {expected_total}, Got {stats.total_xp}")
            return False

    current_xp = 0
    
    # Test 1: Daily Login (+25)
    await profile_service.get_profile(str(user_id), auth_user=auth_user)
    current_xp += 25
    await check_xp(current_xp, "Daily Login")
    
    # Test 2: Profile Update (+15)
    await profile_service.patch_profile(auth_user, identity_schemas.ProfilePatch(bio="Updated bio for XP"))
    current_xp += 15
    await check_xp(current_xp, "Profile Update")
    
    # Test 3: Chat Sent (+2)
    # Simulating hook
    await xp_service.award_xp(user_id, XPAction.CHAT_SENT)
    current_xp += 2
    await check_xp(current_xp, "Chat Sent (Simulated Hook)")

    # Test 4: Host Meetup (+100)
    req = MeetupCreateRequest(
        title="XP Party",
        description="Testing",
        start_at=datetime.now() + timedelta(days=1),
        location_name="Quad",
        category=MeetupCategory.SOCIAL,
        visibility=MeetupVisibility.CAMPUS,
        capacity=5
    )
    await meetup_svc.create_meetup(auth_user, req)
    current_xp += 100
    await check_xp(current_xp, "Host Meetup")

    # Test 5 & 6: Join Meetup (+50)
    host_id = uuid4()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (id, handle, display_name, campus_id, updated_at) 
            VALUES ($1::uuid, 'host_' || substr($1::text, 1, 8), 'Host User', $2::uuid, NOW())
            ON CONFLICT (id) DO NOTHING
        """, str(host_id), str(campus_id))
    host_auth = AuthenticatedUser(id=str(host_id), campus_id=str(campus_id))
    m2 = await meetup_svc.create_meetup(host_auth, req)
    
    await meetup_svc.join_meetup(m2.id, auth_user)
    current_xp += 50
    await check_xp(current_xp, "Join Meetup")

    # Test 7: Send Friend Invite (+10)
    await social_service.send_invite(auth_user, host_id, campus_id=campus_id)
    current_xp += 10
    await check_xp(current_xp, "Send Invite")
    
    # Test 8: Friend Accept (+50)
    inbox = await social_service.list_inbox(host_auth)
    invite_id = inbox[0].id
    await social_service.accept_invite(host_auth, invite_id)
    # This awards XP to BOTH.
    current_xp += 50
    await check_xp(current_xp, "Friend Request Accepted")
    
    # Test 9: Play Game (+10) & Win (+20)
    await xp_service.award_xp(user_id, XPAction.GAME_PLAYED)
    current_xp += 10
    await check_xp(current_xp, "Game Played (Simulated Hook)")
    
    await xp_service.award_xp(user_id, XPAction.GAME_WON)
    current_xp += 20
    await check_xp(current_xp, "Game Won (Simulated Hook)")
    
    print("\n------------------------------------------------")
    print(f"FINAL SCORE: {current_xp} XP")
    print("------------------------------------------------")

    await close_pool()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(verify_actions())
