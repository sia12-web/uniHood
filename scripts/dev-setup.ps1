# Development Setup Script
# Creates .env file with development secrets and sets up the environment

Write-Host "🚀 Setting up development environment..." -ForegroundColor Cyan
Write-Host ""

# Check if .env already exists
if (Test-Path ".env") {
    Write-Host "⚠️  .env file already exists!" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/N)"
    if ($response -ne "y") {
        Write-Host "❌ Setup cancelled" -ForegroundColor Red
        exit 1
    }
}

# Create .env file with development secrets
Write-Host "📝 Creating .env file with development secrets..." -ForegroundColor Yellow
$envContent = @"
# Development Environment Variables
# ⚠️ NEVER commit this file to git!

# CRITICAL SECRETS (for development only - change in production!)
SECRET_KEY=dev-secret-key-change-in-production-$(Get-Random)
SERVICE_SIGNING_KEY=dev-signing-key-change-in-production-$(Get-Random)
REFRESH_PEPPER=dev-refresh-pepper-change-in-production-$(Get-Random)

# Database
POSTGRES_PASSWORD=postgres

# CORS
CORS_ALLOW_ORIGINS=http://localhost:3000

# Security (disabled for local dev)
COOKIE_SECURE=false
ENVIRONMENT=development
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host "✅ .env file created" -ForegroundColor Green

Write-Host ""
Write-Host "🐳 Restarting Docker containers..." -ForegroundColor Yellow
docker compose down
Start-Sleep -Seconds 2
docker compose up -d

Write-Host ""
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "🔧 Regenerating Prisma client..." -ForegroundColor Yellow
docker compose exec activities npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Development environment setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 You can now:" -ForegroundColor Cyan
    Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
    Write-Host "  - Backend API: http://localhost:8000" -ForegroundColor White
    Write-Host "  - Activities Service: http://localhost:3001" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host ""
    Write-Host "⚠️  Prisma generation failed. Trying to restart activities service..." -ForegroundColor Yellow
    docker compose restart activities
    Start-Sleep -Seconds 5
    docker compose exec activities npx prisma generate
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Fixed! Development environment ready!" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Setup had issues. Check logs with: docker compose logs activities" -ForegroundColor Red
    }
}
