import asyncio
import os
import sys
from uuid import UUID

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
    email = "unihoodapp@gmail.com"
    print(f"Checking user: {email}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id, handle, display_name FROM users WHERE email = $1", email)
        if not user:
            print(f"User {email} not found.")
            # Check for demo handle
            user = await conn.fetchrow("SELECT id, handle, display_name FROM users WHERE handle = 'demo'")
            if user:
                 print(f"Found handle 'demo' with ID: {user['id']}")
            return
        
        user_id = user['id']
        print(f"Found User ID: {user_id}")
        
        xp_stats = await conn.fetchrow("SELECT total_xp, current_level FROM user_xp_stats WHERE user_id = $1", str(user_id))
        if xp_stats:
            print(f"XP Stats: {dict(xp_stats)}")
        else:
            print("No XP Stats found in user_xp_stats table.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
