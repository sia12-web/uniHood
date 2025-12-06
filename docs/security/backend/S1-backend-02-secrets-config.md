# S1-backend-02: Secrets & Configuration

> **Severity**: S1 (Critical)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

Guidelines for managing secrets, API keys, and sensitive configuration.

## Requirements

### 1. Secret Storage

- **Never commit secrets to version control**
- Use environment variables or secret management service
- Supported sources:
  - Environment variables (development)
  - Docker secrets (containerized)
  - AWS Secrets Manager / HashiCorp Vault (production)

### 2. Required Secrets

| Secret | Purpose | Rotation Period |
|--------|---------|-----------------|
| `JWT_SECRET_KEY` | JWT signing | 90 days |
| `DATABASE_URL` | PostgreSQL connection | On compromise |
| `REDIS_URL` | Redis connection | On compromise |
| `SMTP_PASSWORD` | Email sending | 90 days |
| `S3_SECRET_KEY` | File storage | 90 days |

### 3. Configuration Hierarchy

1. Environment variables (highest priority)
2. `.env` file (local development only)
3. Default values in `settings.py` (non-sensitive only)

### 4. Validation

- All required secrets must be present at startup
- Fail fast if critical secrets are missing
- Log warning for optional missing config (no secret values)

### 5. Secret Exposure Prevention

- Never log secret values
- Redact secrets in error messages
- Use `SecretStr` type in Pydantic models
- Sanitize secrets from stack traces

## Implementation Checklist

- [ ] Pydantic settings with `SecretStr` types
- [ ] Startup validation for required secrets
- [ ] Secret redaction in logging
- [ ] Documentation of all required env vars
- [ ] Example `.env.example` file (no real values)

## Anti-Patterns

```python
# ❌ BAD: Hardcoded secret
JWT_SECRET = "my-secret-key"

# ❌ BAD: Logging secrets
logger.info(f"Connecting with password: {password}")

# ✅ GOOD: Environment variable
JWT_SECRET = os.environ["JWT_SECRET_KEY"]

# ✅ GOOD: SecretStr type
class Settings(BaseSettings):
    jwt_secret: SecretStr
```

## Related Specs

- [S1-backend-01-authentication.md](./S1-backend-01-authentication.md)
