
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

# Manually load .env
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
        count = await conn.fetchval("SELECT count(*) FROM users")
        print(f"Total Users: {count}")
        
        users = await conn.fetch("SELECT id, handle, campus_id, email_verified, deleted_at FROM users LIMIT 5")
        for u in users:
            print(f"User: {u['handle']}, Verified: {u['email_verified']}, Campus: {u['campus_id']}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
