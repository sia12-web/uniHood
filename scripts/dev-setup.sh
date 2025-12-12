#!/bin/bash
# Development Setup Script
# Creates .env file with development secrets and sets up the environment

echo "🚀 Setting up development environment..."
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " response
    if [ "$response" != "y" ]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

# Create .env file with development secrets
echo "📝 Creating .env file with development secrets..."
cat > .env << 'EOF'
# Development Environment Variables
# ⚠️ NEVER commit this file to git!

# CRITICAL SECRETS (for development only - change in production!)
SECRET_KEY=dev-secret-key-change-in-production
SERVICE_SIGNING_KEY=dev-signing-key-change-in-production
REFRESH_PEPPER=dev-refresh-pepper-change-in-production

# Database
POSTGRES_PASSWORD=postgres

# CORS
CORS_ALLOW_ORIGINS=http://localhost:3000

# Security (disabled for local dev)
COOKIE_SECURE=false
ENVIRONMENT=development
EOF

echo "✅ .env file created"

echo ""
echo "🐳 Restarting Docker containers..."
docker compose down
sleep 2
docker compose up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

echo ""
echo "🔧 Regenerating Prisma client..."
docker compose exec activities npx prisma generate

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Development environment setup complete!"
    echo ""
    echo "🎉 You can now:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend API: http://localhost:8000"
    echo "  - Activities Service: http://localhost:3001"
    echo ""
else
    echo ""
    echo "⚠️  Prisma generation failed. Trying to restart activities service..."
    docker compose restart activities
    sleep 5
    docker compose exec activities npx prisma generate
    
    if [ $? -eq 0 ]; then
        echo "✅ Fixed! Development environment ready!"
    else
        echo "❌ Setup had issues. Check logs with: docker compose logs activities"
    fi
fi
