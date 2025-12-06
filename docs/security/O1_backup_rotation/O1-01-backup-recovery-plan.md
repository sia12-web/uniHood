# O1-01: Backup & Recovery Plan

> Status: ✅ **Implemented** — Scripts available in `scripts/backup/`

## Implementation

Backup scripts have been implemented in `scripts/backup/`:

| Script | Purpose |
|--------|---------|
| `backup_postgres.py` | Full PostgreSQL database backup with compression and S3 upload |
| `restore_postgres.py` | Restore database from backup with verification |
| `backup_redis.py` | Redis RDB snapshot backup |
| `backup_media.py` | User-uploaded media files backup |
| `run_all_backups.py` | Orchestrator for all backup jobs |

See `scripts/backup/README.md` for usage instructions.

## Goals

- Ensure data is recoverable in case of failure, attack, or corruption
- Define and test RTO (Recovery Time Objective) and RPO (Recovery Point Objective)
- Automate backup processes and restore testing

## Backup Strategy

### Database Backups (PostgreSQL)

#### Backup Types

| Type | Frequency | Retention | Purpose |
|------|-----------|-----------|---------|
| WAL archiving | Continuous | 7 days | Point-in-time recovery |
| Base backup | Daily (2 AM) | 30 days | Full restore |
| Weekly snapshot | Sunday 3 AM | 90 days | Long-term recovery |

#### WAL Archiving Setup

```bash
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://divan-backups/wal/%f --sse AES256'
archive_timeout = 300  # Archive every 5 minutes at minimum
```

#### Base Backup Script

```bash
#!/bin/bash
# /scripts/backup_postgres.sh

set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
S3_BUCKET="s3://divan-backups/postgres"
RETENTION_DAYS=30

echo "Starting PostgreSQL backup: ${DATE}"

# Create base backup
pg_basebackup \
  -h localhost \
  -U backup_user \
  -D "${BACKUP_DIR}/${DATE}" \
  -Ft \
  -z \
  -P

# Upload to S3
aws s3 cp \
  "${BACKUP_DIR}/${DATE}" \
  "${S3_BUCKET}/${DATE}/" \
  --recursive \
  --sse AES256

# Cleanup old local backups
find "${BACKUP_DIR}" -type d -mtime +7 -exec rm -rf {} +

# Verify backup
pg_verifybackup "${BACKUP_DIR}/${DATE}" || {
  echo "Backup verification failed!"
  exit 1
}

echo "Backup completed: ${DATE}"
```

#### Docker Compose Addition

```yaml
# Add to docker-compose.yml
services:
  backup:
    image: postgres:16
    volumes:
      - ./scripts/backup_postgres.sh:/backup.sh
      - backup_data:/backups
    environment:
      - PGHOST=postgres
      - PGUSER=backup_user
      - PGPASSWORD=${BACKUP_PASSWORD}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    entrypoint: ["crond", "-f"]
    # Cron: 0 2 * * * /backup.sh

volumes:
  backup_data:
```

### File Storage Backups

#### Media/Attachments

| Source | Destination | Frequency | Retention |
|--------|-------------|-----------|-----------|
| S3 primary | S3 backup region | Real-time (replication) | 90 days |
| Local uploads | S3 | Daily | 30 days |

```bash
#!/bin/bash
# /scripts/backup_media.sh

# Sync local uploads to S3
aws s3 sync \
  /data/uploads \
  s3://divan-backups/media/$(date +%Y%m%d)/ \
  --sse AES256 \
  --delete
```

### Redis Backups

```bash
#!/bin/bash
# /scripts/backup_redis.sh

DATE=$(date +%Y%m%d_%H%M%S)

# Trigger RDB snapshot
redis-cli BGSAVE
sleep 10

# Copy RDB file
cp /data/redis/dump.rdb /backups/redis/dump_${DATE}.rdb

# Upload to S3
aws s3 cp \
  /backups/redis/dump_${DATE}.rdb \
  s3://divan-backups/redis/ \
  --sse AES256
```

## Recovery Procedures

### RTO/RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Database corruption | 1 hour | 15 minutes (WAL) |
| Complete data loss | 4 hours | 24 hours (daily backup) |
| Single table recovery | 30 minutes | 15 minutes |
| File storage loss | 2 hours | Real-time (replication) |

### Database Restore Procedures

#### Point-in-Time Recovery (PITR)

```bash
#!/bin/bash
# /scripts/restore_pitr.sh
# Restore to specific timestamp

TARGET_TIME="$1"  # e.g., "2024-01-15 14:30:00"
BACKUP_DATE="$2"  # e.g., "20240115"

# 1. Stop application
docker compose stop backend

# 2. Download base backup
aws s3 cp \
  s3://divan-backups/postgres/${BACKUP_DATE}/ \
  /restore/base/ \
  --recursive

# 3. Extract base backup
tar -xzf /restore/base/base.tar.gz -C /restore/pgdata

# 4. Download WAL files
aws s3 sync \
  s3://divan-backups/wal/ \
  /restore/wal/ \
  --exclude "*" \
  --include "0000*"

# 5. Configure recovery
cat > /restore/pgdata/recovery.signal << EOF
EOF

cat > /restore/pgdata/postgresql.auto.conf << EOF
restore_command = 'cp /restore/wal/%f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# 6. Start PostgreSQL with recovery
docker compose up -d postgres

# 7. Wait for recovery
until pg_isready; do sleep 1; done

# 8. Verify data
docker compose exec postgres psql -c "SELECT COUNT(*) FROM users;"

# 9. Restart application
docker compose up -d backend
```

#### Full Restore

```bash
#!/bin/bash
# /scripts/restore_full.sh

BACKUP_DATE="$1"

# 1. Stop everything
docker compose down

# 2. Download backup
aws s3 cp \
  s3://divan-backups/postgres/${BACKUP_DATE}/ \
  /restore/ \
  --recursive

# 3. Remove existing data
rm -rf /data/postgres/*

# 4. Extract backup
tar -xzf /restore/base.tar.gz -C /data/postgres

# 5. Start database
docker compose up -d postgres

# 6. Wait and verify
sleep 30
docker compose exec postgres psql -c "SELECT COUNT(*) FROM users;"

# 7. Start application
docker compose up -d
```

### Table-Level Recovery

```bash
#!/bin/bash
# Restore specific table from backup

TABLE_NAME="$1"
BACKUP_DATE="$2"

# 1. Restore backup to temporary database
createdb restore_temp
pg_restore \
  -d restore_temp \
  -t ${TABLE_NAME} \
  /restore/${BACKUP_DATE}/database.dump

# 2. Copy data to production
pg_dump -t ${TABLE_NAME} restore_temp | psql divan

# 3. Cleanup
dropdb restore_temp
```

## Automated Restore Testing

### Monthly Restore Test

```bash
#!/bin/bash
# /scripts/test_restore.sh
# Run monthly via cron: 0 4 1 * * /scripts/test_restore.sh

set -euo pipefail

SLACK_WEBHOOK="${SLACK_WEBHOOK_URL}"
DATE=$(date +%Y%m%d)
LATEST_BACKUP=$(aws s3 ls s3://divan-backups/postgres/ | tail -1 | awk '{print $2}')

echo "Starting restore test for backup: ${LATEST_BACKUP}"

# 1. Create isolated test environment
docker compose -f docker-compose.restore-test.yml up -d postgres-test

# 2. Download and restore backup
aws s3 cp \
  s3://divan-backups/postgres/${LATEST_BACKUP} \
  /restore-test/ \
  --recursive

tar -xzf /restore-test/base.tar.gz -C /restore-test/pgdata

# 3. Start test database
docker compose -f docker-compose.restore-test.yml up -d

# 4. Run verification queries
USERS=$(docker compose -f docker-compose.restore-test.yml \
  exec postgres-test psql -t -c "SELECT COUNT(*) FROM users;")
SESSIONS=$(docker compose -f docker-compose.restore-test.yml \
  exec postgres-test psql -t -c "SELECT COUNT(*) FROM sessions;")

# 5. Run smoke tests
docker compose -f docker-compose.restore-test.yml \
  exec backend-test pytest tests/smoke/ --tb=short

# 6. Cleanup
docker compose -f docker-compose.restore-test.yml down -v

# 7. Report results
curl -X POST "${SLACK_WEBHOOK}" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"✅ Monthly restore test completed\",
    \"attachments\": [{
      \"fields\": [
        {\"title\": \"Backup\", \"value\": \"${LATEST_BACKUP}\", \"short\": true},
        {\"title\": \"Users restored\", \"value\": \"${USERS}\", \"short\": true},
        {\"title\": \"Sessions restored\", \"value\": \"${SESSIONS}\", \"short\": true},
        {\"title\": \"Smoke tests\", \"value\": \"Passed\", \"short\": true}
      ]
    }]
  }"

echo "Restore test completed successfully"
```

### Restore Test Checklist

| Check | Query/Command | Expected |
|-------|---------------|----------|
| Database starts | `pg_isready` | Ready |
| Users table | `SELECT COUNT(*) FROM users` | > 0 |
| Sessions table | `SELECT COUNT(*) FROM sessions` | > 0 |
| Foreign keys | `SELECT * FROM pg_stat_user_tables` | No orphans |
| Indexes | `SELECT * FROM pg_indexes` | All present |
| API health | `curl /health/ready` | 200 OK |

## Disaster Recovery Runbook

### Scenario: Complete Database Loss

```
Time 0: Incident detected
├── Page on-call DBA
├── Assess damage
└── Declare incident

Time +5min: Begin recovery
├── Identify latest good backup
├── Download from S3
└── Prepare restore environment

Time +30min: Restore in progress
├── Extract backup
├── Apply WAL if available
└── Start database

Time +45min: Verification
├── Run integrity checks
├── Verify user counts
└── Test API endpoints

Time +60min: Service restoration
├── Update DNS if needed
├── Restart applications
└── Monitor closely

Time +90min: Post-incident
├── Notify users if needed
├── Begin postmortem
└── Document lessons
```

## Storage Requirements

| Backup Type | Size Estimate | Monthly Cost |
|-------------|---------------|--------------|
| Daily database | ~5 GB × 30 = 150 GB | ~$4 |
| Weekly snapshot | ~5 GB × 12 = 60 GB | ~$2 |
| WAL archives | ~10 GB | ~$0.30 |
| Media backups | ~50 GB | ~$1.50 |
| **Total** | ~270 GB | **~$8/month** |

## Action Items

1. [ ] Set up S3 bucket for backups with versioning
2. [ ] Configure WAL archiving
3. [ ] Create backup scripts and cron jobs
4. [ ] Test restore procedure manually
5. [ ] Set up automated monthly restore test
6. [ ] Create backup monitoring alerts
7. [ ] Document recovery runbook for team
8. [ ] Create dedicated backup IAM user with minimal permissions
