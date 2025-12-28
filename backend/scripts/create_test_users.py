import asyncio
import uuid
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
    print(f"Loading environment from {env_path}")
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()

from app.infra.postgres import get_pool
from app.infra.password import PASSWORD_HASHER
from app.domain.xp.models import LEVEL_THRESHOLDS

# Main Campus ID from Identity Service
MAIN_CAMPUS_ID = "33333333-3333-3333-3333-333333333333"

async def main():
    print("Connecting to database...")
    pool = await get_pool()
    password = "password123"
    password_hash = PASSWORD_HASHER.hash(password)
    
    print(f"Creating users for Levels {sorted(LEVEL_THRESHOLDS.keys())}...")
    
    async with pool.acquire() as conn:
        # Fetch a valid campus ID
        campus_id = await conn.fetchval("SELECT id FROM campuses LIMIT 1")
        if not campus_id:
             print("Error: No campuses found in database. Please create a campus first.")
             return
        campus_id = str(campus_id)
        print(f"Using Campus ID: {campus_id}")

        for level, threshold in LEVEL_THRESHOLDS.items():
            email = f"level{level}@example.com"
            handle = f"UserLevel{level}"
            display_name = f"Level {level} User"
            
            # Check for existing user to get ID or create new
            existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
            
            if existing:
                user_id = str(existing['id'])
                print(f"Updating existing user {handle} ({user_id})...")
                await conn.execute("""
                    UPDATE users 
                    SET handle = $2, 
                        display_name = $3, 
                        password_hash = $4,
                        email_verified = TRUE,
                        campus_id = $5
                    WHERE id = $1
                """, user_id, handle, display_name, password_hash, campus_id)
            else:
                user_id = str(uuid.uuid4())
                print(f"Creating new user {handle} ({user_id})...")
                # Mimic full IdentityService registration defaults
                await conn.execute("""
                    INSERT INTO users (
                        id, email, email_verified, handle, display_name, bio, avatar_key,
                        campus_id, privacy, status, password_hash, avatar_url, created_at, updated_at
                    )
                    VALUES ($1, $2, TRUE, $3, $4, '', NULL, $5,
                        jsonb_build_object('visibility','everyone','ghost_mode',FALSE),
                        jsonb_build_object('text','', 'emoji','', 'updated_at', NOW()),
                        $6, NULL, NOW(), NOW())
                """, user_id, email, handle, display_name, campus_id, password_hash)

            # Insert or Update XP Stats
            # We give them exactly the threshold amount
            print(f"  -> Setting XP to {threshold} (Level {level})")
            await conn.execute("""
                INSERT INTO user_xp_stats (user_id, total_xp, current_level, last_updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (user_id) DO UPDATE 
                SET total_xp = $2, current_level = $3, last_updated_at = NOW()
            """, user_id, threshold, level)

    print("\n✅ Success! Created/Updated the following users:")
    for level in LEVEL_THRESHOLDS.keys():
        print(f"  - Level {level}: level{level}@example.com / {password}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
