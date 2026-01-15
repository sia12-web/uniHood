
import asyncio
from app.infra.postgres import get_pool

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("--- Users ---")
        users = await conn.fetch("SELECT id, handle, display_name, created_at FROM users ORDER BY created_at DESC LIMIT 10")
        for u in users:
            print(f"{u['id']} | {u['handle']} | {u['display_name']} | {u['created_at']}")
            
        print("\n--- Friendships ---")
        friends = await conn.fetch("SELECT * FROM friendships")
        for f in friends:
            print(dict(f))
            
        print("\n--- Meetups ---")
        meetups = await conn.fetch("SELECT * FROM meetups")
        for m in meetups:
            print(dict(m))
            
        print("\n--- Meetup Participants ---")
        parts = await conn.fetch("SELECT * FROM meetup_participants")
        for p in parts:
            print(dict(p))

if __name__ == "__main__":
    asyncio.run(main())
