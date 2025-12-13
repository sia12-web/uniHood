#!/usr/bin/env python
"""
Script to check game stats after playing.
Run from the project root: 
  cd backend && .venv\Scripts\python.exe ..\scripts\check_game_stats.py
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

async def main():
    print("=" * 60)
    print("🎮 Game Stats Checker")
    print("=" * 60)
    
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    ugs.user_id,
                    u.handle,
                    u.display_name,
                    ugs.activity_key,
                    ugs.games_played,
                    ugs.wins,
                    ugs.losses,
                    ugs.draws,
                    ugs.points
                FROM user_game_stats ugs
                JOIN users u ON u.id::text = ugs.user_id
                ORDER BY u.handle, ugs.activity_key
            """)
            
            if not rows:
                print("\n📊 No game stats found")
                print("   Users may not have played any games yet.")
                return
                
            print(f"\n📊 Current Game Stats:\n")
            print("=" * 80)
            
            current_user = None
            for row in rows:
                if current_user != row['handle']:
                    current_user = row['handle']
                    print(f"\n👤 {row['display_name']} (@{row['handle']})")
                    print("-" * 40)
                
                game_name = row['activity_key'].replace('_', ' ').title()
                
                # Calculate expected points based on formula
                expected_points = (row['games_played'] * 50) + (row['wins'] * 150)
                points_match = "✅" if row['points'] == expected_points else f"⚠️ (expected {expected_points})"
                
                print(f"   🎮 {game_name}:")
                print(f"      Games Played: {row['games_played']}")
                print(f"      Wins:         {row['wins']}")
                print(f"      Losses:       {row['losses']}")
                print(f"      Draws:        {row['draws']}")
                print(f"      Points:       {row['points']} {points_match}")
            
            print("\n" + "=" * 80)
            
            # Summary
            print("\n📈 Summary:")
            total_games = sum(r['games_played'] for r in rows) // 2  # Divide by 2 since each game has 2 players
            total_wins = sum(r['wins'] for r in rows)
            total_losses = sum(r['losses'] for r in rows)
            
            print(f"   Total unique games played: {total_games}")
            print(f"   Total wins recorded: {total_wins}")
            print(f"   Total losses recorded: {total_losses}")
            
            if total_wins == total_losses:
                print("   ✅ Wins = Losses (correct for 1v1 games)")
            else:
                print("   ⚠️  Wins != Losses (something may be off)")
                
            print("\n💡 Expected behavior after 1 Speed Typing game:")
            print("   Winner: 1 played, 1 win, 0 losses, 200 points")
            print("   Loser:  1 played, 0 wins, 1 loss,  50 points")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
