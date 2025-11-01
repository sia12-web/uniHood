# Phase 4 — Identity & Profiles (Verification v2) / test_plan.md

## Fixtures
- Campus C1 { domain="utoronto.ca" }
- Users: u1 (email_verified), u2 (not verified)
- OIDC provider mocked (stable id_token)
- S3 presign/upload mocked
- Admin user a1 with role=admin
- Clock frozen for expiry tests

## Unit — SSO
- start → generates nonce+state; callback with valid id_token (email @utoronto.ca) → verifications row approved
- wrong domain → 403
- invalid token signature → 401

## Unit — Doc Upload & Submit
- presign enforces mime/bytes; returns key
- submit creates pending verification
- duplicate submit allowed (multiple attempts), each row separate

## Unit — Admin Decisions
- queue returns pending rows
- approve sets state=approved + decided_at; recompute trust called; audit trail row created
- reject sets state=rejected + reason

## Unit — Trust Recompute
- email_verified only → level=1, badge=verified
- doc approved → level=2, badge=verified_plus
- sso approved + doc approved → level=3
- expiry picks minimum among active approvals

## Integration
- After doc approval, `/verify/status` shows level/badge/expiry
- After expiry job runs, trust downgrades; user notified (mock)

## Security
- Admin endpoints require admin role → non-admin 403
- SSO state/nonce verified; PKCE enforced
- Evidence URLs are pre-signed, time-limited; not stored in logs

## Rate Limits
- >10 SSO attempts/h → 429
- >6 doc submits/h → 429

## Performance
- /verify/status P95 < 80ms
- Admin queue list P95 < 120ms for 1k pending
