import asyncio
import os
import sys

# Add parent dir to path if needed to find app
sys.path.append(os.getcwd())

from app.infra.postgres import init_pool, close_pool

async def check_db():
    from app.settings import settings
    print(f"Connecting to: {settings.postgres_url}")
    pool = await init_pool()
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
            print("Tables found in public schema:")
            for row in rows:
                print(f" - {row['table_name']}")
            
            # Check users specifically
            try:
                count = await conn.fetchval("SELECT count(*) FROM users")
                print(f"\nUser count: {count}")
            except Exception as e:
                print(f"\nFailed to query users table: {e}")
    finally:
        await close_pool()

if __name__ == "__main__":
    asyncio.run(check_db())
