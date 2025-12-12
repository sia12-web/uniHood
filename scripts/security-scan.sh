#!/bin/bash
# Security Scan Script
# Run all security checks locally before committing

echo "🔒 Running Security Scans..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Python Security - Safety
echo "📦 Checking Python dependencies for vulnerabilities..."
cd backend
if command -v safety &> /dev/null; then
    safety check
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Vulnerabilities found in Python dependencies${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ No vulnerabilities in Python dependencies${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Safety not installed. Run: pip install safety${NC}"
fi
cd ..

echo ""

# Python Security - Bandit
echo "🐍 Scanning Python code for security issues..."
if command -v bandit &> /dev/null; then
    bandit -r backend/app -ll
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Security issues found in Python code${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ No security issues in Python code${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Bandit not installed. Run: pip install bandit${NC}"
fi

echo ""

# Node.js Security - npm audit
echo "📦 Checking Node.js dependencies for vulnerabilities..."
cd frontend
if command -v npm &> /dev/null; then
    npm audit
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Vulnerabilities found in Node.js dependencies${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ No vulnerabilities in Node.js dependencies${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  npm not found${NC}"
fi
cd ..

echo ""

# Check for secrets
echo "🔑 Checking for exposed secrets..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Check if any .env files are staged
    if git diff --cached --name-only | grep -q "\.env$"; then
        echo -e "${RED}❌ .env file is staged! Never commit secrets!${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ No .env files staged${NC}"
    fi
fi

echo ""
echo "================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS security issue(s)${NC}"
    exit 1
fi
