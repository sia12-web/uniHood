$ErrorActionPreference = "Stop"

Write-Host "Tearing down Docker containers and volumes..."
docker compose -f infra/docker/compose.yaml down -v

Write-Host "Starting Postgres and Redis..."
docker compose -f infra/docker/compose.yaml up -d postgres redis

Write-Host "Waiting for Postgres to be ready..."
$retries = 30
while ($retries -gt 0) {
    try {
        # Try to connect using python since we don't have psql
        python -c "import psycopg2; psycopg2.connect('postgresql://postgres:postgres@localhost:5432/divan')" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Postgres is ready!"
            break
        }
    } catch {
        # Ignore errors
    }
    Start-Sleep -Seconds 1
    $retries--
    Write-Host -NoNewline "."
}

if ($retries -eq 0) {
    Write-Error "Postgres failed to start."
}

Write-Host "`nApplying migrations..."
python scripts/apply_migrations.py

Write-Host "Seeding campus..."
python scripts/seed_campus.py

Write-Host "Done! You can now start the backend and run the user seeding script."
