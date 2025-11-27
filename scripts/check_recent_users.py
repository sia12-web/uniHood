import asyncio
import os
import sys
from uuid import UUID

# Add backend to path
current_dir = os.getcwd()
if os.path.basename(current_dir) == 'backend':
    sys.path.append(current_dir)
else:
    sys.path.append(os.path.join(current_dir, 'backend'))

from app.infra.postgres import get_pool
from app.settings import settings

async def main():
    print(f"Connecting to {settings.postgres_url}")
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT id, email, handle, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT 5")
            print(f"Found {len(rows)} users:")
            for row in rows:
                print(f"User: {row['email']} (Handle: {row['handle']}) - Verified: {row['email_verified']} - Created: {row['created_at']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
