#!/usr/bin/env powershell
# Safe script to reset ONLY game stats - does NOT affect any other data
# Run from project root: .\scripts\reset_stats_safely.ps1

Write-Host "=============================================="
Write-Host "   SAFE Game Stats Reset Script"
Write-Host "=============================================="
Write-Host ""

# Step 1: Show current users
Write-Host "[1/4] Fetching users..."
docker exec unihood-postgres-1 psql -U postgres -d unihood -c "SELECT handle, display_name, email FROM users WHERE deleted_at IS NULL;"

# Step 2: Show current game stats (if any)
Write-Host ""
Write-Host "[2/4] Current game stats (before reset)..."
docker exec unihood-postgres-1 psql -U postgres -d unihood -c "SELECT * FROM user_game_stats;"

# Step 3: Delete ONLY from user_game_stats table
Write-Host ""
Write-Host "[3/4] Resetting game stats (ONLY user_game_stats table)..."
docker exec unihood-postgres-1 psql -U postgres -d unihood -c "DELETE FROM user_game_stats;"

# Step 4: Clear ONLY the leaderboard Redis keys (not all Redis data)
Write-Host ""
Write-Host "[4/4] Clearing Redis leaderboard counters..."
# Get all leaderboard keys and delete them
$keys = docker exec unihood-redis-1 redis-cli KEYS "lb:day:*"
if ($keys) {
    foreach ($key in $keys -split "`n") {
        if ($key.Trim()) {
            docker exec unihood-redis-1 redis-cli DEL $key.Trim() | Out-Null
        }
    }
    Write-Host "   Deleted leaderboard keys"
}
else {
    Write-Host "   No leaderboard keys found"
}

Write-Host ""
Write-Host "=============================================="
Write-Host "   Done! Game stats reset to 0"
Write-Host "   All other data (friends, profiles) preserved"
Write-Host "=============================================="
Write-Host ""
Write-Host "Now play a Speed Typing game and check stats with:"
Write-Host "  .\scripts\check_stats.ps1"
