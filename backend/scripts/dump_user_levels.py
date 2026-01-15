
import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("--- Users ---")
        users = await conn.fetch("SELECT id, handle, display_name, campus_id, created_at FROM users ORDER BY created_at DESC LIMIT 20")
        for u in users:
            uid = u['id']
            # Get friend count
            f_count = await conn.fetchval("SELECT COUNT(*) FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'", uid)
            # Get meetup count
            m_count = await conn.fetchval("SELECT COUNT(*) FROM meetups WHERE creator_user_id = $1", uid)
            # Get join count
            j_count = await conn.fetchval("SELECT COUNT(*) FROM meetup_participants WHERE user_id = $1 AND status = 'JOINED'", uid)
            
            points = f_count * 50 + m_count * 100 + j_count * 30
            from app.domain.leaderboards.policy import calculate_social_score_level
            level = calculate_social_score_level(points)
            
            # Get XP level
            xp_row = await conn.fetchrow("SELECT total_xp, current_level FROM user_xp_stats WHERE user_id = $1", uid)
            xp_lvl = xp_row['current_level'] if xp_row else 1
            xp_val = xp_row['total_xp'] if xp_row else 0
            
            print(f"{uid} | {u['handle']} | Campus: {u['campus_id']} | Social Lvl: {level} (Pts: {points}) | XP Lvl: {xp_lvl} (XP: {xp_val})")

if __name__ == "__main__":
    asyncio.run(main())
