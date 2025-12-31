import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def check_db():
    load_dotenv()
    url = os.getenv("POSTGRES_URL")
    print(f"Connecting to {url}")
    try:
        conn = await asyncpg.connect(url)
        print("Connected successfully!")
        val = await conn.fetchval("SELECT 1")
        print(f"Result of SELECT 1: {val}")
        await conn.close()
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
