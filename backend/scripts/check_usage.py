import asyncio
import os
import sys
from datetime import datetime, timezone

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
from app.infra.redis import redis_client

async def main():
    email = "level6@example.com"
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if not user:
            print("User not found")
            return
        user_id = str(user['id'])
        
        from app.domain.social.policy import get_current_usage
        usage = await get_current_usage(user_id)
        print(f"Current Usage for {email}: {usage}")
        
        # Check raw redis keys
        now = datetime.now(timezone.utc)
        per_day_bucket = now.strftime("%Y%m%d")
        per_day_key = f"rl:invite:daily:{user_id}:{per_day_bucket}"
        val = await redis_client.get(per_day_key)
        print(f"Redis Value ({per_day_key}): {val}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
