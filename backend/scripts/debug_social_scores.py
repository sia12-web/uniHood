
import asyncio
from app.infra.postgres import get_pool
from app.domain.leaderboards.service import LeaderboardService
from uuid import UUID

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        users = await conn.fetch("SELECT id, handle, display_name, created_at FROM users ORDER BY created_at DESC LIMIT 5")
        print(f"{'ID':<40} {'Handle':<20} {'Display Name':<20} {'Created At'}")
        print("-" * 100)
        svc = LeaderboardService()
        for user in users:
            uid = user["id"]
            # Try to get social score from the service (live)
            try:
                score_data = await svc._calculate_live_social_scores(UUID('00000000-0000-0000-0000-000000000001'), 100) # Dummy campus, wait
                # Actually, let's just query the counts directly
                counts = await conn.fetchrow("""
                    SELECT 
                        (SELECT COUNT(*) FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted') as friends,
                        (SELECT COUNT(*) FROM meetups WHERE creator_user_id = $1) as hosted,
                        (SELECT COUNT(*) FROM meetup_participants WHERE user_id = $1 AND status = 'JOINED') as joined
                    """, uid)
                
                points = counts['friends'] * 50 + counts['hosted'] * 100 + counts['joined'] * 30
                from app.domain.leaderboards.policy import calculate_social_score_level
                level = calculate_social_score_level(points)
                
                print(f"{str(uid):<40} {user['handle']:<20} {user['display_name']:<20} {user['created_at']} | Level: {level} (Points: {points})")
            except Exception as e:
                print(f"Error for {uid}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
