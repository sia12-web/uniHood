# O1-02: Secrets Rotation Policy

> Status: ⚠️ **Partial** — Secrets exist, rotation not automated

## Goals

- Define rotation schedules for all secrets
- Automate rotation where possible
- Enable graceful key transition without downtime
- Document emergency rotation procedures

## Secret Inventory

### Current Secrets

| Secret | Location | Current Rotation | Target Rotation |
|--------|----------|------------------|-----------------|
| `SECRET_KEY` (JWT signing) | Env var | Never | 90 days |
| `DATABASE_URL` | Env var | Never | 180 days (password) |
| `REDIS_PASSWORD` | Env var | Never | 180 days |
| `REFRESH_PEPPER` | Env var | Never | Annual |
| API keys (SendGrid, etc.) | Env var | Manual | 180 days |
| OAuth client secrets | Env var | Manual | Annual |

### Secret Storage

| Environment | Storage | Access Control |
|-------------|---------|----------------|
| Development | `.env` file | Git-ignored |
| Staging | GitHub Secrets | Team access |
| Production | AWS Secrets Manager | IAM roles |

## Rotation Schedules

### Tier 1: High-Frequency (90 days)

| Secret | Reason | Automation |
|--------|--------|------------|
| JWT signing key | High exposure | Automated |
| Session secrets | Security best practice | Automated |

### Tier 2: Medium-Frequency (180 days)

| Secret | Reason | Automation |
|--------|--------|------------|
| Database password | Compliance | Semi-automated |
| Redis password | Compliance | Semi-automated |
| Third-party API keys | Vendor recommendation | Manual |

### Tier 3: Low-Frequency (Annual)

| Secret | Reason | Automation |
|--------|--------|------------|
| `REFRESH_PEPPER` | Invalidates all tokens | Manual + planned |
| OAuth secrets | Low risk | Manual |
| Encryption keys | Data-at-rest | Manual |

## JWT Key Rotation

### Architecture for Graceful Rotation

```python
# backend/app/infra/jwt.py

import os
from datetime import datetime

# Support multiple keys for rotation
JWT_KEYS = {
    "current": os.getenv("SECRET_KEY"),
    "previous": os.getenv("SECRET_KEY_PREVIOUS", ""),  # For graceful rotation
}

def encode_access(payload: dict) -> str:
    """Always encode with current key."""
    payload["kid"] = "current"  # Key ID
    return jwt.encode(payload, JWT_KEYS["current"], algorithm="HS256")

def decode_access(token: str) -> dict:
    """Try current key, fall back to previous."""
    # Try current key first
    try:
        return jwt.decode(token, JWT_KEYS["current"], algorithms=["HS256"])
    except jwt.InvalidSignatureError:
        pass
    
    # Fall back to previous key during rotation window
    if JWT_KEYS["previous"]:
        try:
            return jwt.decode(token, JWT_KEYS["previous"], algorithms=["HS256"])
        except jwt.InvalidSignatureError:
            pass
    
    raise jwt.InvalidTokenError("Invalid signature")
```

### Rotation Procedure

```bash
#!/bin/bash
# /scripts/rotate_jwt_key.sh

# 1. Generate new key
NEW_KEY=$(openssl rand -base64 32)

# 2. Update secrets (AWS Secrets Manager example)
aws secretsmanager update-secret \
  --secret-id divan/prod/jwt \
  --secret-string "{
    \"SECRET_KEY\": \"${NEW_KEY}\",
    \"SECRET_KEY_PREVIOUS\": \"$(aws secretsmanager get-secret-value --secret-id divan/prod/jwt | jq -r '.SecretString | fromjson | .SECRET_KEY')\"
  }"

# 3. Trigger deployment (pulls new secrets)
# This depends on your deployment method
kubectl rollout restart deployment/backend

# 4. After 30 minutes (access token TTL + buffer), remove old key
# Schedule this as a separate job
echo "Schedule removal of SECRET_KEY_PREVIOUS in 30 minutes"
```

### Rotation Timeline

```
Day 0: Generate new SECRET_KEY
       Set current SECRET_KEY as SECRET_KEY_PREVIOUS
       Deploy with both keys

Day 0 + 30min: All access tokens now use new key
              Previous key only needed for tokens issued before rotation

Day 0 + 1hr: Safe to remove SECRET_KEY_PREVIOUS
            (All access tokens have expired)

Day 0 + 30d: Refresh tokens using old key have expired
            Rotation complete
```

## Database Password Rotation

### Procedure

```bash
#!/bin/bash
# /scripts/rotate_db_password.sh

NEW_PASSWORD=$(openssl rand -base64 24)

# 1. Create new password in PostgreSQL
docker compose exec postgres psql -U postgres -c \
  "ALTER USER app_user WITH PASSWORD '${NEW_PASSWORD}';"

# 2. Update secret store
aws secretsmanager update-secret \
  --secret-id divan/prod/database \
  --secret-string "{\"password\": \"${NEW_PASSWORD}\"}"

# 3. Restart application (reconnects with new password)
docker compose restart backend

# 4. Verify connectivity
docker compose exec backend python -c "
from app.infra.postgres import get_pool
import asyncio
async def test():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print(await conn.fetchval('SELECT 1'))
asyncio.run(test())
"
```

### Connection Pool Considerations

```python
# Ensure connection pool can handle password changes
# Use connection validation

async def get_pool():
    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=5,
        max_size=20,
        # Validate connections before use
        setup=lambda conn: conn.add_log_listener(log_callback),
        # Reconnect on auth failure
        command_timeout=60,
    )
```

## Redis Password Rotation

```bash
#!/bin/bash
# /scripts/rotate_redis_password.sh

NEW_PASSWORD=$(openssl rand -base64 24)

# 1. Set new password (Redis 6+ supports ACL)
docker compose exec redis redis-cli \
  ACL SETUSER default on >${NEW_PASSWORD} ~* +@all

# 2. Update secret store
aws secretsmanager update-secret \
  --secret-id divan/prod/redis \
  --secret-string "{\"password\": \"${NEW_PASSWORD}\"}"

# 3. Restart application
docker compose restart backend

# 4. Verify connectivity
docker compose exec backend python -c "
from app.infra.redis import redis_client
import asyncio
asyncio.run(redis_client.ping())
print('Redis connection OK')
"
```

## Emergency Rotation

### When to Trigger

- Secret exposed in logs
- Secret committed to git
- Employee departure
- Security incident
- Suspected compromise

### Emergency Procedure

```bash
#!/bin/bash
# /scripts/emergency_rotate.sh

SECRET_TYPE="$1"  # jwt, database, redis, all

notify_slack() {
  curl -X POST "${SLACK_WEBHOOK}" \
    -d "{\"text\": \"🚨 Emergency secret rotation: ${1}\"}"
}

case "${SECRET_TYPE}" in
  jwt)
    notify_slack "JWT signing key"
    ./rotate_jwt_key.sh
    # Force logout all users (optional, if compromise severe)
    docker compose exec redis redis-cli FLUSHDB
    ;;
  database)
    notify_slack "Database password"
    ./rotate_db_password.sh
    ;;
  redis)
    notify_slack "Redis password"
    ./rotate_redis_password.sh
    ;;
  all)
    notify_slack "ALL SECRETS"
    ./rotate_jwt_key.sh
    ./rotate_db_password.sh
    ./rotate_redis_password.sh
    ;;
  *)
    echo "Usage: $0 {jwt|database|redis|all}"
    exit 1
    ;;
esac

# Log rotation event
echo "$(date): Emergency rotation of ${SECRET_TYPE}" >> /var/log/security/rotations.log
```

### Post-Rotation Checklist

- [ ] Verify all services healthy
- [ ] Check error rates in monitoring
- [ ] Confirm old secret no longer works
- [ ] Update documentation if needed
- [ ] Create incident ticket if triggered by breach
- [ ] Notify affected parties if user data involved

## Automation with AWS Secrets Manager

### Automatic Rotation Lambda

```python
# lambda/rotate_secret.py

import boto3
import string
import secrets

def lambda_handler(event, context):
    """AWS Secrets Manager rotation Lambda."""
    
    secret_id = event['SecretId']
    step = event['Step']
    
    secrets_client = boto3.client('secretsmanager')
    
    if step == 'createSecret':
        # Generate new secret
        new_password = ''.join(
            secrets.choice(string.ascii_letters + string.digits)
            for _ in range(32)
        )
        secrets_client.put_secret_value(
            SecretId=secret_id,
            ClientRequestToken=event['ClientRequestToken'],
            SecretString=new_password,
            VersionStages=['AWSPENDING']
        )
        
    elif step == 'setSecret':
        # Apply new secret to service
        # (Implementation depends on secret type)
        pass
        
    elif step == 'testSecret':
        # Verify new secret works
        pass
        
    elif step == 'finishSecret':
        # Promote pending to current
        secrets_client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=event['ClientRequestToken'],
            RemoveFromVersionId=get_current_version(secret_id)
        )
```

### Secrets Manager Configuration

```yaml
# terraform/secrets.tf

resource "aws_secretsmanager_secret" "jwt_key" {
  name = "divan/prod/jwt"
  
  rotation_rules {
    automatically_after_days = 90
  }
}

resource "aws_secretsmanager_secret_rotation" "jwt_rotation" {
  secret_id           = aws_secretsmanager_secret.jwt_key.id
  rotation_lambda_arn = aws_lambda_function.rotate_secret.arn
}
```

## Monitoring & Alerts

### Rotation Tracking

```yaml
# Add to alerting_rules.yml

- alert: SecretRotationOverdue
  expr: |
    (time() - secret_last_rotated_timestamp{secret="jwt_key"}) > 90 * 24 * 3600
  labels:
    severity: warning
  annotations:
    summary: "JWT key rotation overdue"
    description: "JWT signing key has not been rotated in over 90 days"
```

### Audit Logging

```python
# Log all secret access and rotation
async def audit_secret_rotation(secret_name: str, rotated_by: str):
    await audit.log_event(
        "secret_rotated",
        meta={
            "secret": secret_name,
            "rotated_by": rotated_by,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
```

## Action Items

1. [ ] Add `SECRET_KEY_PREVIOUS` support to JWT module
2. [ ] Set up AWS Secrets Manager for production
3. [ ] Create rotation scripts for each secret type
4. [ ] Configure automated rotation for JWT (90 days)
5. [ ] Add rotation alerts to monitoring
6. [ ] Document emergency rotation in runbook
7. [ ] Test rotation procedure in staging
8. [ ] Schedule quarterly rotation drills
