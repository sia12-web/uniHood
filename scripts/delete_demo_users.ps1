<#
PowerShell helper: delete_demo_users.ps1

This script will:
 - Prompt for DB connection details (or use environment variables PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
 - Run a verification SELECT for the demo user IDs and print results
 - Prompt you to confirm deletion
 - If confirmed, attempt to run DELETE statements in order (sessions -> friendships -> users)

It will try to use local `psql` if available, otherwise it will use a temporary Postgres Docker container (requires Docker Desktop).

USAGE (PowerShell):
  .\scripts\delete_demo_users.ps1

#>

param(
  [string]$DbHost = $env:PGHOST,
  [int]$Port = 0,
  [string]$User = $env:PGUSER,
  [string]$Password = $env:PGPASSWORD,
  [string]$Database = $env:PGDATABASE
)

function ReadIfEmpty([string]$value, [string]$prompt) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return Read-Host -Prompt $prompt
  }
  return $value
}

$DbHost = ReadIfEmpty $DbHost "Postgres host (default: localhost)"
if ([string]::IsNullOrWhiteSpace($DbHost)) { $DbHost = 'localhost' }
$defaultPort = if ($env:PGPORT -and ($env:PGPORT -as [int])) { [int]$env:PGPORT } else { 5432 }
$Port = ReadIfEmpty "$Port" "Postgres port (default: $defaultPort)"
if ([string]::IsNullOrWhiteSpace($Port)) { $Port = $defaultPort } else { $Port = [int]$Port }
$User = ReadIfEmpty $User "DB user"
$Password = ReadIfEmpty $Password "DB password"
$Database = ReadIfEmpty $Database "Database name"

# Demo IDs
$demoUsers = @("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","cccccccc-cccc-cccc-cccc-cccccccccccc")
$demoCampus = 'c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2'
$extraCampus = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

# Build connection string
Write-Host "Using connection: ${User}@${DbHost}:${Port}/${Database}"

# Helper to run psql locally
function Invoke-LocalPsql {
  param($Sql)
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) { return $null }
  $escaped = $Sql -replace '"','""'
  $args = @("-h", $DbHost, "-p", $Port, "-U", $User, "-d", $Database, "-c", $Sql)
  $env:PGPASSWORD = $Password
  try {
    & psql @args
    return $true
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

# Helper to run psql inside Docker
function Invoke-DockerPsql {
  param($Sql)
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { return $null }
  $pwdWin = (Get-Location).ProviderPath
  # Use host.docker.internal so container reaches host Postgres on Windows
  $hostForContainer = if ($DbHost -eq 'localhost' -or $DbHost -eq '127.0.0.1') { 'host.docker.internal' } else { $DbHost }
  $args = @(
    "--rm",
    "-e", "PGPASSWORD=$Password",
    "-v", "${pwdWin}:/work",
    "-w", "/work",
    "postgres:15",
    "psql",
    "-h", $hostForContainer,
    "-p", "$Port",
    "-U", $User,
    "-d", $Database,
    "-c", $Sql
  )
  Write-Host "Running in Docker: postgres:15 psql -h $hostForContainer -p $Port -U $User -d $Database -c \"$Sql\""
  & docker @args | Out-Host
  return $true
}

# Run verification SELECT
$selectSql = "SELECT id, email, handle FROM users WHERE id IN ('{0}','{1}');" -f $demoUsers[0], $demoUsers[1]
Write-Host "\n== Verification: SELECT demo users ==`n"
if (Invoke-LocalPsql -Sql $selectSql) { Write-Host "(Used local psql)" } 
elseif (Invoke-DockerPsql -Sql $selectSql) { Write-Host "(Used Dockerized psql)" }
else { Write-Error "No psql or Docker found. Install psql or Docker to run these commands."; exit 1 }

# Confirm
$confirm = Read-Host -Prompt "Do you want to DELETE these demo users and dependent rows? Type 'yes' to proceed"
if ($confirm -ne 'yes') { Write-Host "Aborting - no changes made."; exit 0 }

# Run deletions in the safe ordering
$deletes = @(
  "BEGIN;",
  "DELETE FROM sessions WHERE user_id IN ('{0}','{1}');" -f $demoUsers[0], $demoUsers[1],
  "DELETE FROM friendships WHERE user_id IN ('{0}','{1}') OR friend_id IN ('{0}','{1}');" -f $demoUsers[0], $demoUsers[1],
  "DELETE FROM users WHERE id IN ('{0}','{1}');" -f $demoUsers[0], $demoUsers[1],
  "COMMIT;"
)
$fullSql = $deletes -join "\n"
Write-Host "\n== Executing deletions ==`n"
if (Invoke-LocalPsql -Sql $fullSql) { Write-Host "(Used local psql for deletes)" }
elseif (Invoke-DockerPsql -Sql $fullSql) { Write-Host "(Used Dockerized psql for deletes)" }
else { Write-Error "No psql or Docker found. Install psql or Docker to run these commands."; exit 1 }

Write-Host "\nDeletion completed. Verify with SELECT again if needed."

# Optional: ask about deleting campus
$campusConfirm = Read-Host -Prompt "Do you also want to DELETE the demo campus id $demoCampus ? Type 'yes' to proceed"
if ($campusConfirm -eq 'yes') {
  $campusSql = "DELETE FROM campuses WHERE id = '$demoCampus';"
  if (Invoke-LocalPsql -Sql $campusSql) { Write-Host "Deleted campus (local psql)" }
  elseif (Invoke-DockerPsql -Sql $campusSql) { Write-Host "Deleted campus (docker psql)" }
  else { Write-Error "No psql or Docker found. Install psql or Docker to run this command."; exit 1 }
  Write-Host "Campus deletion complete." 
} else {
  Write-Host "Skipped campus deletion." 
}

# Optional: delete the other demo campus that appears in seeds/env files
$extraCampusConfirm = Read-Host -Prompt "Do you want to DELETE the other demo campus id $extraCampus (used in some seeds/.env)? Type 'yes' to proceed"
if ($extraCampusConfirm -eq 'yes') {
  $extraSql = "DELETE FROM campuses WHERE id = '$extraCampus';"
  if (Invoke-LocalPsql -Sql $extraSql) { Write-Host "Deleted extra campus (local psql)" }
  elseif (Invoke-DockerPsql -Sql $extraSql) { Write-Host "Deleted extra campus (docker psql)" }
  else { Write-Error "No psql or Docker found. Install psql or Docker to run this command."; exit 1 }
  Write-Host "Extra campus deletion complete." 
} else {
  Write-Host "Skipped extra campus deletion." 
}

# End
