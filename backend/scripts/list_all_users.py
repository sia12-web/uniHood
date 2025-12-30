
import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        users = await conn.fetch("SELECT id, handle, campus_id, created_at FROM users ORDER BY created_at DESC")
        print(f"Total users: {len(users)}")
        for u in users:
            print(dict(u))

if __name__ == "__main__":
    asyncio.run(main())
