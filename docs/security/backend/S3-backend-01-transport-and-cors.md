# S3-backend-01: Transport Security & CORS

> **Severity**: S3 (Medium)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

Transport layer security, HTTPS enforcement, and CORS configuration.

## Requirements

### 1. HTTPS Enforcement

- **Production**: All traffic must be HTTPS
- Redirect HTTP to HTTPS (301 permanent)
- HSTS header with minimum 1 year max-age
- Include subdomains in HSTS

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 2. TLS Configuration

- Minimum TLS 1.2, prefer TLS 1.3
- Strong cipher suites only
- Disable SSL 2.0, 3.0, TLS 1.0, 1.1
- Certificate must be valid and from trusted CA

### 3. CORS Policy

**Allowed Origins** (production):
- `https://app.divan.com`
- `https://admin.divan.com`

**Allowed Origins** (development):
- `http://localhost:3000`
- `http://localhost:8000`

**CORS Headers**:
```python
CORS_CONFIG = {
    "allow_origins": ["https://app.divan.com"],
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type", "X-Request-Id", "X-Idempotency-Key"],
    "expose_headers": ["X-Request-Id", "X-RateLimit-Remaining"],
    "max_age": 600,  # Preflight cache 10 minutes
}
```

### 4. Security Headers

```python
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",  # Disabled, use CSP instead
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
}
```

### 5. Cookie Security

```python
COOKIE_CONFIG = {
    "httponly": True,      # No JavaScript access
    "secure": True,        # HTTPS only (production)
    "samesite": "lax",     # CSRF protection
    "domain": ".divan.com", # Shared across subdomains
    "path": "/",
}
```

### 6. WebSocket Security

- Validate Origin header on connection
- Require authentication token
- Same CORS rules as HTTP

## Implementation Checklist

- [ ] CORS middleware configuration
- [ ] Security headers middleware
- [ ] Cookie settings in auth module
- [ ] HTTPS redirect middleware (production)
- [ ] WebSocket origin validation

## Related Specs

- [S3-backend-02-rate-limits-and-logs.md](./S3-backend-02-rate-limits-and-logs.md)
