# Security Scan Script for Windows
# Run all security checks locally before committing

Write-Host "🔒 Running Security Scans..." -ForegroundColor Cyan
Write-Host ""

$ERRORS = 0

# Python Security - Safety
Write-Host "📦 Checking Python dependencies for vulnerabilities..." -ForegroundColor Yellow
Set-Location backend
if (Get-Command safety -ErrorAction SilentlyContinue) {
    safety check
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Vulnerabilities found in Python dependencies" -ForegroundColor Red
        $ERRORS++
    } else {
        Write-Host "✅ No vulnerabilities in Python dependencies" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Safety not installed. Run: pip install safety" -ForegroundColor Yellow
}
Set-Location ..

Write-Host ""

# Python Security - Bandit
Write-Host "🐍 Scanning Python code for security issues..." -ForegroundColor Yellow
if (Get-Command bandit -ErrorAction SilentlyContinue) {
    bandit -r backend/app -ll
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Security issues found in Python code" -ForegroundColor Red
        $ERRORS++
    } else {
        Write-Host "✅ No security issues in Python code" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Bandit not installed. Run: pip install bandit" -ForegroundColor Yellow
}

Write-Host ""

# Node.js Security - npm audit
Write-Host "📦 Checking Node.js dependencies for vulnerabilities..." -ForegroundColor Yellow
Set-Location frontend
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm audit
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Vulnerabilities found in Node.js dependencies" -ForegroundColor Red
        $ERRORS++
    } else {
        Write-Host "✅ No vulnerabilities in Node.js dependencies" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  npm not found" -ForegroundColor Yellow
}
Set-Location ..

Write-Host ""

# Check for secrets
Write-Host "🔑 Checking for exposed secrets..." -ForegroundColor Yellow
if (Test-Path .git) {
    $stagedFiles = git diff --cached --name-only
    if ($stagedFiles -match "\.env$") {
        Write-Host "❌ .env file is staged! Never commit secrets!" -ForegroundColor Red
        $ERRORS++
    } else {
        Write-Host "✅ No .env files staged" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
if ($ERRORS -eq 0) {
    Write-Host "✅ All security checks passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Found $ERRORS security issue(s)" -ForegroundColor Red
    exit 1
}
