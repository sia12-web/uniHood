# S1-backend-01: Authentication

> **Severity**: S1 (Critical)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

This document specifies authentication mechanisms for the Divan backend API.

## Requirements

### 1. Token-Based Authentication

- **JWT Access Tokens**
  - Short-lived (15 minutes recommended)
  - Contains: `sub` (user_id), `iat`, `exp`, `campus_id`, `roles`
  - Signed with RS256 or HS256 (configurable)
  - Never store sensitive data in payload

- **Refresh Tokens**
  - Long-lived (7-30 days)
  - Stored server-side with device fingerprint
  - Single-use with rotation on each refresh
  - Revocable per-device or globally

### 2. Password Security

- **Hashing**: Argon2id with recommended parameters
  - Memory: 64 MB minimum
  - Iterations: 3 minimum
  - Parallelism: 4
- **Minimum Length**: 8 characters
- **Complexity**: No strict rules, use password strength meter
- **Breached Password Check**: Optional integration with HaveIBeenPwned

### 3. Session Management

- Track active sessions per user
- Allow users to view and revoke sessions
- Automatic session invalidation on password change
- Device fingerprinting for anomaly detection

### 4. Multi-Factor Authentication (Future)

- TOTP-based 2FA
- WebAuthn/Passkeys support
- Recovery codes (one-time use)

## Implementation Checklist

- [ ] JWT signing key rotation mechanism
- [ ] Refresh token storage with device binding
- [ ] Password policy enforcement
- [ ] Session listing endpoint
- [ ] Session revocation endpoint
- [ ] Login anomaly detection

## Related Specs

- [S1-backend-02-secrets-config.md](./S1-backend-02-secrets-config.md)
- [S1-frontend-01-auth-storage.md](../frontend/S1-frontend-01-auth-storage.md)
