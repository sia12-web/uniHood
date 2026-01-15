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
from app.infra.redis import redis_client

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("--- USER STATUS ---")
        users = await conn.fetch("SELECT id, handle, display_name, campus_id, email_verified, deleted_at, lat, lon FROM users")
        for u in users:
            uid = str(u['id'])
            print(f"User: {u['handle']} ({u['display_name']})")
            print(f"  ID: {uid}")
            print(f"  Campus: {u['campus_id']}")
            print(f"  Verified: {u['email_verified']}, Deleted: {u['deleted_at']}")
            print(f"  Pos: {u['lat']}, {u['lon']}")
            
            # Check Redis presence
            presence = await redis_client.hgetall(f"presence:{uid}")
            if presence:
                print(f"  [REDIS] Presence: {presence}")
            else:
                print("  [REDIS] No presence data")
                
            # Check online status
            online = await redis_client.exists(f"online:user:{uid}")
            print(f"  [REDIS] Online: {bool(online)}")
            
            # Check campus geo
            if u['campus_id']:
                members = await redis_client.zrange(f"geo:presence:{u['campus_id']}", 0, -1)
                print(f"  [REDIS] Campus Geo Members: {members}")
                
            print("-" * 20)

        # Check Global Geo
        global_members = await redis_client.zrange("geo:presence:global", 0, -1)
        print(f"GLOBAL GEO MEMBERS: {global_members}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
