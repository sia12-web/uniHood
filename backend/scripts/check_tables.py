import asyncio
import os
import sys

# Setup path to import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../backend")))

from app.infra import postgres

async def list_tables():
    pool = await postgres.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        print("Tables in DB:")
        for row in rows:
            print(f"- {row['table_name']}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(list_tables())
