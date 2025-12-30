import asyncio
import os
import sys
import re

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

async def main():
    migration_dir = "migrations"
    if not os.path.exists(migration_dir):
        print("Migrations directory not found.")
        return

    files = sorted([f for f in os.listdir(migration_dir) if f.endswith(".sql")])
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        for filename in files:
            print(f"Executing {filename}...")
            path = os.path.join(migration_dir, filename)
            with open(path, "r") as f:
                sql = f.read()
            
            # Use a simple approach: just run the SQL. 
            # Most of our migrations use 'IF NOT EXISTS' or 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS'.
            try:
                # asyncpg execute can handle multiple statements if they are separated by semicolons
                await conn.execute(sql)
                print(f"Finished {filename}")
            except Exception as e:
                print(f"Error in {filename}: {e}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
