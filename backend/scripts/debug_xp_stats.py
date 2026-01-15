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

from app.domain.xp.service import XPService
from app.infra.postgres import get_pool

async def main():
    email = "level6@example.com"
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if not user:
            print("User not found")
            return
        user_id = user['id']
        print(f"User ID from DB: {user_id} (type: {type(user_id)})")
        
        service = XPService()
        
        # Test 1: UUID object
        stats1 = await service.get_user_stats(user_id)
        print(f"Stats with UUID: Level {stats1.current_level}, XP {stats1.total_xp}")
        
        # Test 2: String
        stats2 = await service.get_user_stats(str(user_id))
        print(f"Stats with String: Level {stats2.current_level}, XP {stats2.total_xp}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
