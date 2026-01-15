
import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("--- XP Events ---")
        rows = await conn.fetch("SELECT u.handle, e.* FROM xp_events e JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC")
        for r in rows:
            print(dict(r))

if __name__ == "__main__":
    asyncio.run(main())
