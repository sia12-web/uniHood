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
        rows = await conn.fetch("SELECT id, email, handle, display_name FROM users WHERE display_name ILIKE '%Level 6%' OR email ILIKE '%level6%'")
        print(f"Found {len(rows)} users matching 'Level 6':")
        for r in rows:
            print(f"  - ID: {r['id']}, Email: {r['email']}, Handle: {r['handle']}, Name: {r['display_name']}")
            
            # Check XP stats for this specific ID
            xp = await conn.fetchrow("SELECT total_xp, current_level FROM user_xp_stats WHERE user_id = $1", r['id'])
            if xp:
                print(f"    XP: {xp['total_xp']}, Level: {xp['current_level']}")
            else:
                print("    NO XP STATS FOUND")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
