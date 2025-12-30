
import asyncio
from app.infra.redis import redis_client
from datetime import datetime

async def main():
    day = datetime.now().strftime('%Y%m%d')
    pattern = f"lb:day:{day}:user:*"
    keys = await redis_client.keys(pattern)
    print(f"Checking Redis keys for day {day}...")
    for k in keys:
        val = await redis_client.hgetall(k)
        print(f"{k}: {val}")
    
    # Also check XP values in DB
    from app.infra.postgres import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("\n--- XP Stats in DB ---")
        rows = await conn.fetch("SELECT u.handle, x.* FROM user_xp_stats x JOIN users u ON u.id = x.user_id")
        for r in rows:
            print(dict(r))

if __name__ == "__main__":
    asyncio.run(main())
