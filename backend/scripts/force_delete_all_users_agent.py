"""Delete all users from Divan database - Agent version (No Input)."""

import asyncio
import asyncpg
import sys
from pathlib import Path

# Load database URL from .env
env_file = Path(__file__).parent.parent / ".env"
db_url = None
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                db_url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("POSTGRES_URL="):
                db_url = line.split("=", 1)[1].strip().strip('"')
                
            if db_url: break

if not db_url:
    db_url = "postgresql://postgres:postgres@localhost:5432/divan"
    print(f"Using default database URL: {db_url}")


async def delete_all_users() -> None:
    print("WARNING: This will DELETE ALL USERS from the database! (Agent Forced)")
    
    print("\nConnecting to database...")
    conn = await asyncpg.connect(db_url)
    
    try:
        # Get all user IDs first
        users = await conn.fetch("SELECT id, handle, email FROM users")
        user_count = len(users)
        
        print(f"Found {user_count} users to delete.")
        
        print("\nDeleting all users and related data...")
        
        # Delete related data first (to avoid foreign key constraints)
        tables_to_clean = [
            "email_verifications",
            "email_change_requests",
            "sessions",
            "authenticators",
            "trusted_devices",
            "account_deletions",
            "user_roles",
            "user_interests",
            "user_skills",
            "user_phones",
            "friendships",
            "friend_requests",
            "blocks",
            "activity_stats",
            "meetup_participants",
            "meetups",
            "room_participants",
            "room_messages",
            "rooms",
            "audit_log",
            "xp_events",
            "daily_xp_claims",
            "user_xp_stats",
            # Add other potential tables if any
            "leaderboards",
            "leaderboard_scores", 
            "feed_items",
        ]
        
        for table in tables_to_clean:
            try:
                async with conn.transaction():
                    # Handle potential errors if table doesn't exist gracefully
                    result = await conn.execute(f"DELETE FROM {table}")
                    count = result.split()[-1] if result else "0"
                    print(f"   Cleaned {table} ({count} rows)")
            except Exception as e:
                # Skip if table doesn't exist
                if "does not exist" in str(e):
                    print(f"   Skipped {table} (table does not exist)")
                else:
                    print(f"   WARNING: Could not clean {table}: {e}")
        
        # Delete all users in a final transaction
        async with conn.transaction():
            result = await conn.execute("DELETE FROM users")
            count = result.split()[-1] if result else "0"
            print(f"   Deleted {count} users from 'users' table")
        
        print("\nSuccessfully deleted all users and their data!")
        
    finally:
        await conn.close()


def main() -> None:
    try:
        if sys.platform == 'win32':
             asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(delete_all_users())
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
