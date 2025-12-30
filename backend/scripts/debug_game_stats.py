
import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM user_game_stats")
        for row in rows:
            print(dict(row))

if __name__ == "__main__":
    asyncio.run(main())
