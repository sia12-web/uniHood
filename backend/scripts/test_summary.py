
import asyncio
from app.domain.leaderboards.service import LeaderboardService
import json

async def main():
    service = LeaderboardService()
    # Let's find a user.
    from app.infra.postgres import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, campus_id FROM users LIMIT 1")
    
    if not user:
        print("No users found")
        return

    print(f"Testing for user {user['id']} (campus: {user['campus_id']})")
    
    summary = await service.get_my_summary(user_id=user['id'], campus_id=user['campus_id'])
    print(json.dumps(summary.dict(), indent=2, default=str))

if __name__ == "__main__":
    asyncio.run(main())
