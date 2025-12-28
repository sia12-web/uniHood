import asyncio
import os
import sys

# Ensure backend path is in sys.path
if os.path.exists("backend"):
    sys.path.append(os.path.join(os.getcwd(), "backend"))
    env_path = os.path.join(os.getcwd(), "backend", ".env")
else:
    sys.path.append(os.getcwd())
    env_path = os.path.join(os.getcwd(), ".env")

# Manually load .env if it exists
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()

from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print(f"{'Email':<30} | {'Handle':<20} | {'XP':<10} | {'Level':<5}")
        print("-" * 75)
        rows = await conn.fetch("""
            SELECT u.email, u.handle, x.total_xp, x.current_level 
            FROM users u 
            JOIN user_xp_stats x ON u.id = x.user_id 
            WHERE u.email LIKE 'level%@example.com'
            ORDER BY x.current_level
        """)
        for row in rows:
            print(f"{row['email']:<30} | {row['handle']:<20} | {row['total_xp']:<10} | {row['current_level']:<5}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
