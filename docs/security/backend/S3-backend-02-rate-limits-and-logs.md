# S3-backend-02: Rate Limits & Logging

> **Severity**: S3 (Medium)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

Rate limiting strategies and security logging requirements.

## Requirements

### 1. Rate Limiting

#### Global Limits (per IP)
| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `*` (default) | 1000 | 1 minute |
| `/auth/login` | 5 | 1 minute |
| `/auth/register` | 3 | 1 minute |
| `/auth/forgot-password` | 3 | 1 hour |
| `/api/mod/*` | 100 | 1 minute |

#### Authenticated Limits (per user)
| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `POST /posts` | 30 | 1 hour |
| `POST /messages` | 100 | 1 minute |
| `POST /reports` | 10 | 1 hour |
| File uploads | 50 | 1 hour |

### 2. Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699876543
Retry-After: 60
```

### 3. Rate Limit Response

```json
{
    "detail": "rate_limit_exceeded",
    "retry_after": 60
}
```
HTTP Status: `429 Too Many Requests`

### 4. Security Logging

#### Required Events
- Authentication success/failure
- Authorization failures (403)
- Rate limit triggers
- Password changes
- Session creation/revocation
- Admin actions
- Moderation actions

#### Log Format
```json
{
    "ts": "2025-01-01T12:00:00Z",
    "level": "info",
    "event": "auth.login.success",
    "user_id": "uuid",
    "ip": "1.2.3.4",
    "user_agent": "...",
    "request_id": "uuid",
    "extra": {}
}
```

### 5. Sensitive Data Redaction

Never log:
- Passwords or tokens
- Full credit card numbers
- Personal identification numbers
- API keys or secrets

Redact in logs:
- Email: `j***@example.com`
- Phone: `***-***-1234`
- IP (if required): Hash or truncate

### 6. Log Retention

| Log Type | Retention |
|----------|-----------|
| Security events | 1 year |
| Access logs | 90 days |
| Application logs | 30 days |
| Debug logs | 7 days |

## Implementation Checklist

- [ ] Redis-based rate limiter
- [ ] Rate limit middleware
- [ ] Structured logging setup
- [ ] Security event logging
- [ ] Log redaction middleware
- [ ] Log rotation configuration

## Related Specs

- [S3-backend-01-transport-and-cors.md](./S3-backend-01-transport-and-cors.md)
