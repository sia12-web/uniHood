
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

# Check if .env exists
print(f"Loading .env from: {env_path}")
from dotenv import load_dotenv
load_dotenv(env_path)

from app.settings import settings
from app.infra.postgres import get_pool

async def main():
    print(f"Environment: {settings.environment}")
    print(f"Is Dev: {settings.is_dev()}")
    print(f"Postgres URL: {settings.postgres_url}")

    pool = await get_pool()
    async with pool.acquire() as conn:
        print("\n--- ALL USERS ---")
        users = await conn.fetch("SELECT id, display_name, handle, campus_id, email_verified, deleted_at FROM users")
        user_map = {}
        for u in users:
            uid = str(u['id'])
            user_map[uid] = u
            print(f"User: {u['display_name']} ({u['handle']})")
            print(f"  ID: {uid}")
            print(f"  Campus: {u['campus_id']}")
            print(f"  Verified: {u['email_verified']}")
            print(f"  Deleted: {u['deleted_at']}")
            print("-" * 20)

        if len(users) < 2:
            print("Less than 2 users found. Cannot simulate discovery.")
            return

        # Simulate discovery for the first user looking for others
        viewer = users[0]
        viewer_id = viewer['id']
        viewer_campus = viewer['campus_id']
        
        print("\n--- DISCOVERY SIMULATION (Campus Mode) ---")
        print(f"Viewer: {viewer['display_name']} ({viewer_id})")
        print(f"Looking in Campus: {viewer_campus}")
        
        is_dev = settings.is_dev()
        # manual reconstruction of the query in proximity/service.py
        query = f"""
            SELECT id, display_name FROM users u
            WHERE campus_id = $1 
            AND id != $2 
            AND deleted_at IS NULL 
            AND (email_verified = TRUE OR {str(is_dev).upper()})
        """
        print(f"Query: {query}")
        
        candidates = await conn.fetch(query, viewer_campus, viewer_id)
        print(f"Found {len(candidates)} candidates:")
        for c in candidates:
            print(f"  - MATCH: {c['display_name']} ({c['id']})")
            
        if len(candidates) == 0:
            print("NO CANDIDATES FOUND. Analysing why...")
            # Check other users
            for other in users:
                if other['id'] == viewer_id: continue
                
                print(f"  Checking {other['display_name']}...")
                if other['campus_id'] != viewer_campus:
                    print(f"    [FAIL] Different Campus: {other['campus_id']} vs {viewer_campus}")
                elif other['deleted_at'] is not None:
                     print("    [FAIL] Deleted")
                elif not other['email_verified'] and not is_dev:
                     print("    [FAIL] Not Verified and not in Dev Mode")
                else:
                     print("    [SUCCESS] Should be visible!")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
