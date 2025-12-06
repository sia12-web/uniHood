# Divan Backup Scripts

This directory contains backup automation scripts for the Divan platform.

## Scripts

| Script | Purpose | Recommended Frequency |
|--------|---------|----------------------|
| `backup_postgres.py` | Full PostgreSQL database backup | Daily at 2 AM |
| `backup_redis.py` | Redis RDB snapshot backup | Daily at 2:30 AM |
| `backup_media.py` | User-uploaded media files | Daily at 3 AM |
| `restore_postgres.py` | Restore database from backup | On-demand |
| `run_all_backups.py` | Orchestrator for all backups | Daily at 2 AM |

## Quick Start

### Prerequisites

```bash
# Install required packages
pip install boto3 redis requests
```

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=divan
POSTGRES_PASSWORD=<your-password>
POSTGRES_DB=divan

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-password>
REDIS_DATA_DIR=/data/redis

# S3 Storage (for remote backups)
S3_BACKUP_BUCKET=divan-backups
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>

# Local paths
BACKUP_DIR=/backups
UPLOADS_DIR=/data/uploads

# Optional: Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Running Backups

```bash
# Run all backups
python scripts/backup/run_all_backups.py --all

# Run specific backups
python scripts/backup/backup_postgres.py
python scripts/backup/backup_redis.py
python scripts/backup/backup_media.py

# Run with Slack notification
python scripts/backup/run_all_backups.py --all --notify
```

### Listing and Restoring Backups

```bash
# List available PostgreSQL backups
python scripts/backup/restore_postgres.py --list

# Restore latest backup
python scripts/backup/restore_postgres.py --latest

# Restore specific backup
python scripts/backup/restore_postgres.py --backup divan_backup_20241205_020000.sql.gz

# Restore with confirmation bypass (for automation)
python scripts/backup/restore_postgres.py --latest --force
```

## Cron Setup

Add to crontab (`crontab -e`):

```cron
# Divan daily backups at 2 AM UTC
0 2 * * * cd /app && /usr/bin/python3 scripts/backup/run_all_backups.py --all --notify >> /var/log/divan_backup.log 2>&1

# Weekly cleanup of old backups (Sunday 4 AM)
0 4 * * 0 find /backups -type f -mtime +30 -delete
```

## Docker Integration

Add to `docker-compose.yml`:

```yaml
services:
  backup:
    build:
      context: .
      dockerfile: Dockerfile.backup
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=divan
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=divan
      - REDIS_HOST=redis
      - S3_BACKUP_BUCKET=${S3_BACKUP_BUCKET}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    volumes:
      - backup_data:/backups
      - uploads_data:/data/uploads:ro
    depends_on:
      - postgres
      - redis
    # Use cron or entrypoint script for scheduling

volumes:
  backup_data:
```

## S3 Bucket Setup

### Create Bucket

```bash
aws s3 mb s3://divan-backups --region us-east-1
```

### Enable Versioning (recommended)

```bash
aws s3api put-bucket-versioning \
  --bucket divan-backups \
  --versioning-configuration Status=Enabled
```

### Lifecycle Policy (auto-cleanup)

```json
{
  "Rules": [
    {
      "ID": "DeleteOldBackups",
      "Status": "Enabled",
      "Filter": {"Prefix": "backups/"},
      "Expiration": {"Days": 90},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 30}
    }
  ]
}
```

### IAM Policy (minimal permissions)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::divan-backups",
        "arn:aws:s3:::divan-backups/*"
      ]
    }
  ]
}
```

## Recovery Procedures

### Full Database Restore

1. **Stop the application**
   ```bash
   docker compose stop backend
   ```

2. **Restore from latest backup**
   ```bash
   python scripts/backup/restore_postgres.py --latest --force
   ```

3. **Verify data integrity**
   ```bash
   docker compose exec postgres psql -U divan -c "SELECT COUNT(*) FROM users;"
   ```

4. **Restart application**
   ```bash
   docker compose up -d backend
   ```

### Point-in-Time Recovery

For point-in-time recovery, you need WAL archiving enabled. See `docs/security/O1_backup_rotation/O1-01-backup-recovery-plan.md` for detailed PITR procedures.

## Monitoring

### Backup Verification

Run monthly to verify backup integrity:

```bash
# Create test database
createdb divan_restore_test

# Restore to test database
python scripts/backup/restore_postgres.py --latest --target-db divan_restore_test --force

# Verify
psql divan_restore_test -c "SELECT COUNT(*) FROM users;"

# Cleanup
dropdb divan_restore_test
```

### Alerts

Set up alerts for:
- Backup job failures (check exit codes)
- Backup file size anomalies (sudden drops)
- S3 upload failures
- Missed backup schedules

## Troubleshooting

### "pg_dump: command not found"

Install PostgreSQL client tools:
```bash
apt-get install postgresql-client
# or
brew install libpq
```

### "S3 upload failed: Access Denied"

Check IAM permissions and ensure AWS credentials are set correctly.

### "Redis BGSAVE failed"

- Ensure Redis has write permissions to data directory
- Check available disk space
- Review Redis logs: `docker compose logs redis`

### Large backup files

- Enable compression (already enabled by default)
- Consider incremental backups with WAL archiving
- Archive old data to cold storage

## Security Notes

1. **Encrypt backups** - S3 uploads use AES-256 server-side encryption
2. **Secure credentials** - Never commit AWS keys or database passwords
3. **Restrict S3 access** - Use IAM roles with minimal permissions
4. **Test restores** - Regularly verify backups can be restored
5. **Monitor access** - Enable S3 access logging for audit trail
