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
from app.domain.identity.deletion import force_delete
from app.infra.auth import AuthenticatedUser

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        users = await conn.fetch("SELECT id, campus_id, email, handle FROM users")
        print(f"Total users to delete: {len(users)}")
        
        for u in users:
            user_id = str(u['id'])
            campus_id = str(u['campus_id']) if u['campus_id'] else "00000000-0000-0000-0000-000000000000"
            email = u['email']
            handle = u['handle']
            
            print(f"Deleting user: {user_id} ({handle} | {email})")
            auth_user = AuthenticatedUser(id=user_id, campus_id=campus_id)
            try:
                await force_delete(auth_user)
                print(f"  Successfully deleted {user_id}")
            except Exception as e:
                print(f"  Failed to delete {user_id}: {e}")
    
    print("User deletion process completed.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
