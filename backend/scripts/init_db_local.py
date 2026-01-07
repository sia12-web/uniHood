import asyncio
import os
import sys
import asyncpg

async def main():
    # Use localhost explicitly for local init
    url = os.environ.get("POSTGRES_URL", "postgresql://postgres:postgres@127.0.0.1:5432/postgres")
    
    # Replace dbname with postgres to connect to system db
    if "/unihood" in url:
        url = url.replace("/unihood", "/postgres")
        
    print(f"Connecting to {url}...")
    try:
        sys_conn = await asyncpg.connect(url)
    except Exception as e:
        print(f"Failed to connect to postgres: {e}")
        return

    try:
        # Check if db exists
        exists = await sys_conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'unihood'")
        if not exists:
            print("Creating database unihood...")
            await sys_conn.execute("CREATE DATABASE unihood")
            print("Database created.")
        else:
            print("Database unihood already exists.")
    except Exception as e:
        print(f"Error checking/creating DB: {e}")
    finally:
        await sys_conn.close()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
