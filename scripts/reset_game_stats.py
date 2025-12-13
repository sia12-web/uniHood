#!/usr/bin/env python
"""
Script to reset game stats and fetch users for testing.
Run from the project root: 
  cd backend && .venv\Scripts\python.exe ..\scripts\reset_game_stats.py
"""

import asyncio
import os
import sys

# Add backend to path
current_dir = os.getcwd()
if os.path.basename(current_dir) == 'backend':
    sys.path.append(current_dir)
else:
    sys.path.append(os.path.join(current_dir, 'backend'))

from app.infra.postgres import get_pool
from app.settings import settings

async def main():
    print("=" * 60)
    print("🎮 Game Stats Reset & User Fetch Script")
    print("=" * 60)
    
    print(f"\nConnecting to database...")
    
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Step 1: Fetch all users
            print("\n📍 Step 1: Fetching all users...")
            users = await conn.fetch("""
                SELECT id, handle, display_name, email, created_at
                FROM users
                WHERE deleted_at IS NULL
                ORDER BY created_at DESC
            """)
            
            print(f"\n📋 Found {len(users)} users:\n")
            print("-" * 80)
            for row in users:
                print(f"  ID:      {row['id']}")
                print(f"  Handle:  {row['handle']}")
                print(f"  Name:    {row['display_name']}")
                print(f"  Email:   {row['email']}")
                print("-" * 80)
            
            # Step 2: Show current stats before reset
            print("\n📍 Step 2: Current stats (before reset)...")
            stats = await conn.fetch("""
                SELECT 
                    ugs.user_id,
                    u.handle,
                    u.display_name,
                    ugs.activity_key,
                    ugs.games_played,
                    ugs.wins,
                    ugs.losses,
                    ugs.points
                FROM user_game_stats ugs
                JOIN users u ON u.id::text = ugs.user_id
                ORDER BY u.handle
            """)
            
            if not stats:
                print("   No existing game stats found.")
            else:
                for row in stats:
                    print(f"   {row['display_name']}: {row['games_played']} played, {row['wins']} wins, {row['points']} points")
            
            # Step 3: Reset all stats
            print("\n📍 Step 3: Resetting all game stats...")
            result = await conn.execute("DELETE FROM user_game_stats")
            print(f"   ✅ Deleted all user_game_stats records: {result}")
            
            # Step 4: Verify stats are reset
            print("\n📍 Step 4: Verifying stats are reset...")
            stats_after = await conn.fetch("SELECT COUNT(*) as count FROM user_game_stats")
            count = stats_after[0]['count']
            print(f"   ✅ Records remaining: {count}")
            
            print("\n" + "=" * 60)
            print("✅ Done! Stats have been reset to 0 for all users.")
            print("   Now play a Speed Typing duel between the users")
            print("   Then run: check_game_stats.py")
            print("=" * 60)
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
