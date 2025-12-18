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
  [string]$Port = $env:PGPORT,
  [string]$User = $env:PGUSER,
  [string]$Password = $env:PGPASSWORD,
  [string]$Database = $env:PGDATABASE,
  [string]$SslMode = $env:PGSSLMODE
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
$Port = ReadIfEmpty $Port "Postgres port (default: $defaultPort)"
if ([string]::IsNullOrWhiteSpace($Port)) {
  $Port = $defaultPort
} else {
  $Port = [int]$Port
}
$User = ReadIfEmpty $User "DB user"
$Password = ReadIfEmpty $Password "DB password"
$Database = ReadIfEmpty $Database "Database name"

# Render Postgres typically requires SSL for external connections.
if ([string]::IsNullOrWhiteSpace($SslMode)) {
  $SslMode = if ($DbHost -and $DbHost -ne 'localhost' -and $DbHost -ne '127.0.0.1') { 'require' } else { 'prefer' }
}

# Demo IDs
$demoUsers = @("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","cccccccc-cccc-cccc-cccc-cccccccccccc")
$demoCampus = 'c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2'
$extraCampus = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
# Seeded demo users created by scripts/seed_demo_users.py
$seededDemoCampus = '33333333-3333-3333-3333-333333333333'
$seededDemoEmailSuffix = '@example.com'
$testDisplayNamePrefix = 'Test User'

# Build connection string
Write-Host "Using connection: ${User}@${DbHost}:${Port}/${Database}"

# Helper to run psql locally
function Invoke-LocalPsql {
  param($Sql)
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) { return $null }
  $psqlArgs = @("-h", $DbHost, "-p", $Port, "-U", $User, "-d", $Database, "-c", $Sql)
  $env:PGPASSWORD = $Password
  $env:PGSSLMODE = $SslMode
  try {
    & psql @psqlArgs
    return ($LASTEXITCODE -eq 0)
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
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
  $dockerArgs = @(
    "run",
    "--rm",
    "-e", "PGPASSWORD=$Password",
    "-e", "PGSSLMODE=$SslMode",
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
  & docker @dockerArgs | Out-Host
  return ($LASTEXITCODE -eq 0)
}

# Run verification SELECT
$selectSql = @(
  "SELECT id, email, handle, campus_id, deleted_at FROM users WHERE id IN ('{0}','{1}');" -f $demoUsers[0], $demoUsers[1],
  "SELECT COUNT(*) AS seeded_demo_users FROM users WHERE email ILIKE '%{0}' OR campus_id = '{1}';" -f $seededDemoEmailSuffix, $seededDemoCampus,
  "SELECT id, email, handle, campus_id, deleted_at FROM users WHERE email ILIKE '%{0}' OR campus_id = '{1}' ORDER BY created_at DESC NULLS LAST LIMIT 20;" -f $seededDemoEmailSuffix, $seededDemoCampus
) -join "\n"

$selectSql = @(
  $selectSql,
  "SELECT COUNT(*) AS test_user_accounts FROM users WHERE display_name ILIKE '{0}%';" -f $testDisplayNamePrefix,
  "SELECT id, email, handle, campus_id, deleted_at FROM users WHERE display_name ILIKE '{0}%' ORDER BY created_at DESC NULLS LAST LIMIT 20;" -f $testDisplayNamePrefix
) -join "\n"

Write-Host "\n== Verification: demo users + seeded demo users ==`n"
$selectOk = $false
$localResult = Invoke-LocalPsql -Sql $selectSql
if ($localResult -eq $true) {
  $selectOk = $true
  Write-Host "(Used local psql)"
} elseif ($localResult -eq $false) {
  Write-Error "Local psql failed. Fix connection/SSL and retry."; exit 1
}

if (-not $selectOk) {
  $dockerResult = Invoke-DockerPsql -Sql $selectSql
  if ($dockerResult -eq $true) {
    $selectOk = $true
    Write-Host "(Used Dockerized psql)"
  } elseif ($dockerResult -eq $false) {
    Write-Error "Dockerized psql failed. Ensure Docker Desktop is running and connection details are correct."; exit 1
  } else {
    Write-Error "No psql or Docker found. Install psql or Docker to run these commands."; exit 1
  }
}

# Confirm
$confirm = Read-Host -Prompt "Do you want to SOFT-DELETE (set deleted_at) demo users so they disappear from the site? Type 'yes' to proceed"
if ($confirm -ne 'yes') { Write-Host "Aborting - no changes made."; exit 0 }

# Soft-delete instead of hard-delete to avoid FK issues.
$softDeleteSql = @(
  "BEGIN;",
  "UPDATE users SET deleted_at = NOW() WHERE deleted_at IS NULL AND (id IN ('{0}','{1}') OR email ILIKE '%{2}' OR campus_id = '{3}' OR display_name ILIKE '{4}%');" -f $demoUsers[0], $demoUsers[1], $seededDemoEmailSuffix, $seededDemoCampus, $testDisplayNamePrefix,
  "COMMIT;"
) -join "\n"

Write-Host "\n== Executing soft-deletion ==`n"
$deleteOk = $false
$localDeleteResult = Invoke-LocalPsql -Sql $softDeleteSql
if ($localDeleteResult -eq $true) {
  $deleteOk = $true
  Write-Host "(Used local psql for soft-delete)"
} elseif ($localDeleteResult -eq $false) {
  Write-Error "Local psql soft-delete failed."; exit 1
}

if (-not $deleteOk) {
  $dockerDeleteResult = Invoke-DockerPsql -Sql $softDeleteSql
  if ($dockerDeleteResult -eq $true) {
    $deleteOk = $true
    Write-Host "(Used Dockerized psql for soft-delete)"
  } elseif ($dockerDeleteResult -eq $false) {
    Write-Error "Dockerized psql soft-delete failed."; exit 1
  } else {
    Write-Error "No psql or Docker found. Install psql or Docker to run these commands."; exit 1
  }
}

Write-Host "\nSoft-deletion completed. Verify with SELECT again if needed."

# Optional: ask about deleting campus
Write-Host "\nWARNING: Deleting campuses can break signup and existing users (campus_not_found) if the app still references these IDs." -ForegroundColor Yellow
$campusConfirm = Read-Host -Prompt "Do you want to DELETE the campus id $demoCampus ? Type 'delete-campus' to proceed"
if ($campusConfirm -eq 'delete-campus') {
  $campusSql = "DELETE FROM campuses WHERE id = '$demoCampus';"
  if (Invoke-LocalPsql -Sql $campusSql) { Write-Host "Deleted campus (local psql)" }
  elseif (Invoke-DockerPsql -Sql $campusSql) { Write-Host "Deleted campus (docker psql)" }
  else { Write-Error "No psql or Docker found. Install psql or Docker to run this command."; exit 1 }
  Write-Host "Campus deletion complete." 
} else {
  Write-Host "Skipped campus deletion." 
}

# Optional: delete the other demo campus that appears in seeds/env files
$extraCampusConfirm = Read-Host -Prompt "Do you want to DELETE the campus id $extraCampus (used in some seeds/.env)? Type 'delete-campus' to proceed"
if ($extraCampusConfirm -eq 'delete-campus') {
  $extraSql = "DELETE FROM campuses WHERE id = '$extraCampus';"
  if (Invoke-LocalPsql -Sql $extraSql) { Write-Host "Deleted extra campus (local psql)" }
  elseif (Invoke-DockerPsql -Sql $extraSql) { Write-Host "Deleted extra campus (docker psql)" }
  else { Write-Error "No psql or Docker found. Install psql or Docker to run this command."; exit 1 }
  Write-Host "Extra campus deletion complete." 
} else {
  Write-Host "Skipped extra campus deletion." 
}

# End
