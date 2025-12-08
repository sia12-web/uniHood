"""Delete all users from Divan database - Standalone version.

WARNING: This will delete ALL users from the database. Use with caution!
"""

import asyncio
import asyncpg
import sys
import os
from pathlib import Path

# Load database URL from .env
env_file = Path(__file__).parent.parent / ".env"
db_url = None
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                db_url = line.split("=", 1)[1].strip().strip('"')
                break

if not db_url:
    db_url = "postgresql://postgres:postgres@localhost:5432/divan"
    print(f"Using default database URL: {db_url}")


async def delete_all_users() -> None:
    print("WARNING: This will DELETE ALL USERS from the database!")
    print("This action cannot be undone.\n")
    
    # Get confirmation
    response = input("Type 'DELETE ALL USERS' to confirm: ")
    if response != "DELETE ALL USERS":
        print("Deletion cancelled.")
        sys.exit(0)
    
    print("\nConnecting to database...")
    conn = await asyncpg.connect(db_url)
    
    try:
        # Get all user IDs first
        users = await conn.fetch("SELECT id, handle, email FROM users")
        user_count = len(users)
        
        if user_count == 0:
            print("No users found in the database.")
            return
        
        print(f"Found {user_count} users:")
        for user in users[:10]:  # Show first 10
            email = user['email'] or '(no email)'
            print(f"   - {user['handle']} ({email})")
        if user_count > 10:
            print(f"   ... and {user_count - 10} more")
        
        # Final confirmation
        print(f"\nAbout to delete {user_count} users!")
        final = input("Type 'YES' to proceed: ")
        if final != "YES":
            print("Deletion cancelled.")
            sys.exit(0)
        
        print("\nDeleting all users and related data...")
        
        # Delete related data first (to avoid foreign key constraints)
        # Each deletion in its own transaction to avoid cascade failures
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
        ]
        
        for table in tables_to_clean:
            try:
                async with conn.transaction():
                    result = await conn.execute(f"DELETE FROM {table}")
                    # Extract row count from result string like "DELETE 5"
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
            print(f"   Deleted all users from 'users' table")
        
        print(f"\nSuccessfully deleted all {user_count} users and their data!")
        print("The database is now clean.")
        
    finally:
        await conn.close()


def main() -> None:
    try:
        asyncio.run(delete_all_users())
    except KeyboardInterrupt:
        print("\nDeletion cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
