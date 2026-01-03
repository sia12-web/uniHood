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
from app.infra.postgres import init_pool, get_pool

async def main():
    print(f"Original Settings POSTGRES_URL: {settings.postgres_url}")
    # The init_pool replaces localhost with 127.0.0.1
    dsn = settings.postgres_url.replace("localhost", "127.0.0.1")
    print(f"DSN being used by app: {dsn}")
    
    # Try multiple common ports if 5433 fails
    ports = ["5432"]
    for port in ports:
        test_dsn = dsn.replace(":5433", f":{port}")
        print(f"Trying port {port} ({test_dsn})...")
        try:
            pool = await init_pool() # This uses settings.postgres_url with replacement
            # Wait, init_pool uses settings.postgres_url. We need to override it.
            # But settings is a singleton.
            # Let's just try direct connection.
            import asyncpg
            conn = await asyncpg.connect(test_dsn)
            print(f"Successfully connected to {test_dsn}")
            
            # Check databases
            db_rows = await conn.fetch("SELECT datname FROM pg_database WHERE datistemplate = false")
            print(f"Available databases on port {port}: {[r[0] for r in db_rows]}")
            
            # If the current DB is NOT the right one, try to connect to others
            for db in [r[0] for r in db_rows]:
                target_dsn = test_dsn.rsplit("/", 1)[0] + "/" + db
                print(f"  Checking database {db}...")
                conn2 = await asyncpg.connect(target_dsn)
                try:
                    tables = await conn2.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
                    table_names = [t[0] for t in tables]
                    print(f"    Tables: {table_names}")
                    if "users" in table_names:
                        print(f"    FOUND USERS TABLE in {db}!")
                        users = await conn2.fetch("SELECT id, handle, display_name, email_verified, campus_id, lat, lon FROM users")
                        for u in users:
                            print(f"      - {u['handle']} ({u['display_name']}): Verified={u['email_verified']}, Campus={u['campus_id']}, Pos=({u['lat']},{u['lon']})")
                except Exception as e:
                    print(f"    Error checking {db}: {e}")
                finally:
                    await conn2.close()
            await conn.close()
        except Exception as e:
            print(f"Failed on port {port}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
