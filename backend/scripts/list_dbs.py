import asyncio
import asyncpg
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

from app.settings import settings

async def main():
    # Try port 5432
    dsn = settings.postgres_url.replace(":5433", ":5432").rsplit("/", 1)[0] + "/postgres"
    print(f"Connecting to {dsn}...")
    try:
        conn = await asyncpg.connect(dsn)
        rows = await conn.fetch("SELECT datname FROM pg_database WHERE datistemplate = false")
        print("Databases:", [r[0] for r in rows])
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
