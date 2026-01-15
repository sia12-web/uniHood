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
    email = "level6@example.com"
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        user_id_uuid = user['id']
        user_id_str = str(user_id_uuid)
        
        print(f"Testing with UUID object: {user_id_uuid}")
        row_uuid = await conn.fetchrow("SELECT current_level FROM user_xp_stats WHERE user_id = $1", user_id_uuid)
        print(f"Result with UUID object: {row_uuid}")
        
        print(f"Testing with String: {user_id_str}")
        row_str = await conn.fetchrow("SELECT current_level FROM user_xp_stats WHERE user_id = $1", user_id_str)
        print(f"Result with String: {row_str}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
