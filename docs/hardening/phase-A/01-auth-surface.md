# Auth Surface & Allowed Flows (Algorithm)

## Goals
- Single source of truth for allowed auth flows.
- No implicit endpoints. All auth endpoints listed and justified.

## Allowed Endpoints (MUST)
- POST /auth/signup
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh
- POST /auth/forgot
- POST /auth/reset
- POST /auth/verify-email (token)
- (Optional) /auth/oauth/{provider}/callback

## Algorithm: Request Validation
1. For each endpoint, define JSON schema.
2. Reject if unknown fields present.
3. Attach `request_id` (uuid v4) to logs and response headers.

## Algorithm: Handler Envelope
1. `try {}` execution.
2. On known validation/auth errors → 4xx with error code.
3. On unexpected → 500 + `request_id`.
4. Emit structured log with: user_id?, ip_hash, request_id, span_id.

## Security
- CORS: allow origins = env allowlist.
- CSRF: Use SameSite and per-path cookies (see cookie spec file).
- Rate limits:
  - /signup: 5/min/IP; 2/min/email prefix windowed.
  - /login: 10/min/IP; 5/min/email.
  - /refresh: 30/min/IP.
