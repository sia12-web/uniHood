# Divan Production Deployment Guide

This guide walks through deploying Divan to a production environment.

## Prerequisites

- Linux server (Ubuntu 22.04 LTS recommended)
- Docker Engine 24+ and Docker Compose v2
- Domain name pointing to your server
- SMTP credentials for email delivery
- (Optional) S3-compatible storage for uploads and backups

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/sia12-web/Divan.git
cd Divan

# 2. Copy and edit environment file
cp .env.production.example .env
nano .env  # Edit with your values

# 3. Generate secrets
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "SERVICE_SIGNING_KEY=$(openssl rand -hex 32)" >> .env
echo "REFRESH_PEPPER=$(openssl rand -hex 32)" >> .env
echo "OBS_ADMIN_TOKEN=$(openssl rand -hex 32)" >> .env

# 4. Start the stack
docker compose -f docker-compose.prod.yml up -d

# 5. Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## Detailed Setup

### Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### Step 2: Domain & DNS

1. Point your domain to your server's IP address
2. Create A record: `divan.app` → `YOUR_SERVER_IP`
3. Create A record: `www.divan.app` → `YOUR_SERVER_IP`
4. Wait for DNS propagation (can take up to 48 hours)

### Step 3: Environment Configuration

```bash
# Create environment file
cp .env.production.example .env

# Generate cryptographic secrets
openssl rand -hex 32  # Run this 4 times for each secret
```

Edit `.env` with your values:

```env
# Domain
DOMAIN=divan.app

# Database (use strong passwords!)
POSTGRES_PASSWORD=<generated-password>
REDIS_PASSWORD=<generated-password>

# Security secrets (from openssl rand -hex 32)
SECRET_KEY=<generated>
SERVICE_SIGNING_KEY=<generated>
REFRESH_PEPPER=<generated>
OBS_ADMIN_TOKEN=<generated>

# Email (example with SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<your-sendgrid-api-key>
SMTP_FROM_EMAIL=noreply@divan.app
```

### Step 4: Deploy

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Watch logs during startup
docker compose -f docker-compose.prod.yml logs -f

# Verify all services are healthy
docker compose -f docker-compose.prod.yml ps
```

### Step 5: Verify Deployment

```bash
# Check that services respond
curl -I https://your-domain.com
curl https://your-domain.com/api/health/live

# Check SSL certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

## Service Management

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart backend
```

### Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Or with zero-downtime (if using multiple instances)
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend
```

### Stop Services

```bash
# Stop all (preserves data)
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (DESTROYS DATA)
docker compose -f docker-compose.prod.yml down -v
```

## Database Management

### Run Migrations

Migrations run automatically on backend startup. To run manually:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python /work/scripts/apply_migrations.py
```

### Database Backup

```bash
# Manual backup
docker compose -f docker-compose.prod.yml --profile backup run backup

# Or run backup script directly
docker compose -f docker-compose.prod.yml exec backend \
  python /work/scripts/backup/backup_postgres.py
```

### Database Restore

```bash
# List available backups
docker compose -f docker-compose.prod.yml exec backend \
  python /work/scripts/backup/restore_postgres.py --list

# Restore latest backup
docker compose -f docker-compose.prod.yml exec backend \
  python /work/scripts/backup/restore_postgres.py --latest
```

### Connect to Database

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U divan -d divan
```

## Monitoring

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health/live` | Kubernetes liveness probe |
| `/health/ready` | Kubernetes readiness probe |
| `/metrics` | Prometheus metrics (requires auth) |

### Prometheus Metrics

The backend exposes Prometheus metrics at `/metrics`. To scrape:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'divan-backend'
    static_configs:
      - targets: ['backend:8000']
    bearer_token: '<OBS_ADMIN_TOKEN>'
```

### Grafana Dashboards

Pre-configured Grafana dashboards are in `infra/grafana/`.

## Scheduled Tasks

### Automated Backups

Add to crontab:

```cron
# Daily backup at 2 AM UTC
0 2 * * * cd /path/to/divan && docker compose -f docker-compose.prod.yml --profile backup run --rm backup >> /var/log/divan-backup.log 2>&1
```

### Log Rotation

Docker handles log rotation by default. To customize:

```json
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

## Security Checklist

- [ ] All secrets are generated and unique
- [ ] `.env` file is not in version control
- [ ] HTTPS is working (check SSL Labs: https://ssllabs.com)
- [ ] Database is not exposed to the internet
- [ ] Redis is not exposed to the internet
- [ ] Firewall only allows ports 80 and 443
- [ ] SSH uses key-based authentication
- [ ] Automatic security updates are enabled

### Firewall Setup (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs backend

# Common issues:
# - Missing environment variables
# - Database not ready (wait for healthcheck)
# - Port already in use
```

### Database Connection Failed

```bash
# Check postgres is healthy
docker compose -f docker-compose.prod.yml ps postgres

# Check connection from backend
docker compose -f docker-compose.prod.yml exec backend \
  python -c "from app.infra.postgres import get_db; print('OK')"
```

### SSL Certificate Issues

```bash
# Check Caddy logs
docker compose -f docker-compose.prod.yml logs caddy

# Common issues:
# - DNS not propagated yet
# - Port 80/443 blocked by firewall
# - Rate limited by Let's Encrypt
```

### Out of Memory

```bash
# Check memory usage
docker stats

# Increase limits in docker-compose.prod.yml
# Or add swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Scaling

### Horizontal Scaling (Multiple Backend Workers)

Adjust `BACKEND_WORKERS` in `.env`:

```env
BACKEND_WORKERS=8  # 2 * CPU cores + 1
```

### Load Balancer Setup

For multiple server instances, use:
- AWS Application Load Balancer
- DigitalOcean Load Balancer  
- HAProxy
- Nginx (as load balancer)

Configure sticky sessions for WebSocket support.

## Support

- GitHub Issues: https://github.com/sia12-web/Divan/issues
- Documentation: `/docs` folder in repository
