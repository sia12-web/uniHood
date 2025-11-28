import asyncio
import asyncpg
import os

# Use the same URL as in settings.py
POSTGRES_URL = "postgresql://postgres:postgres@localhost:5432/divan"

async def test_connection():
    print(f"Connecting to {POSTGRES_URL}...")
    try:
        # Try default connection (matches current code)
        conn = await asyncpg.connect(POSTGRES_URL)
        print("Successfully connected with default settings!")
        await conn.close()
    except Exception as e:
        print(f"Failed to connect with default settings: {e}")

    print("\nRetrying with ssl=False and create_pool...")
    try:
        # Try with ssl=False and create_pool
        pool = await asyncpg.create_pool(POSTGRES_URL, min_size=1, max_size=5, ssl=False)
        print("Successfully created pool with ssl=False!")
        async with pool.acquire() as conn:
            print("Successfully acquired connection from pool!")
        await pool.close()
    except Exception as e:
        print(f"Failed to create pool with ssl=False: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
