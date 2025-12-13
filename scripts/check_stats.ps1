#!/usr/bin/env powershell
# Script to check game stats after playing
# Run from project root: .\scripts\check_stats.ps1

Write-Host "=============================================="
Write-Host "   Game Stats Checker"
Write-Host "=============================================="
Write-Host ""

# Check users first
Write-Host "Users:"
docker exec unihood-postgres-1 psql -U postgres -d unihood -c "SELECT id, handle, display_name FROM users WHERE deleted_at IS NULL;"

Write-Host ""
Write-Host "Game stats:"
docker exec unihood-postgres-1 psql -U postgres -d unihood -c "SELECT user_id, activity_key as game, games_played as played, wins, losses, points FROM user_game_stats ORDER BY user_id;"

Write-Host ""
Write-Host "=============================================="
Write-Host "Expected after 1 Speed Typing game:"
Write-Host "  Winner: 1 played, 1 win, 0 losses, 200 points"
Write-Host "  Loser:  1 played, 0 wins, 1 loss,  50 points"
Write-Host "=============================================="
