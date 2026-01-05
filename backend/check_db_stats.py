import asyncio
from app.infra.postgres import get_pool
from uuid import UUID

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("--- Campuses ---")
        rows = await conn.fetch("SELECT id, name FROM campuses")
        for r in rows:
            print(f"Campus: {r['name']} ({r['id']})")

        print("\n--- Campus Stats ---")
        rows = await conn.fetch("SELECT u.campus_id, c.name, count(*) FROM users u LEFT JOIN campuses c ON u.campus_id = c.id GROUP BY u.campus_id, c.name")
        for r in rows:
            cname = r['name'] if r['name'] else "Unknown/None"
            print(f"Campus: {cname} ({r['campus_id']}) -> {r['count']} users")
            
        print("\n--- Recent Users ---")
        rows = await conn.fetch("SELECT id, handle, campus_id, created_at, email FROM users ORDER BY created_at DESC LIMIT 10")
        for r in rows:
            print(f"User: {r['handle']} ({r['id']}) | Campus: {r['campus_id']} | Email: {r['email']} | Created: {r['created_at']}")
            
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
