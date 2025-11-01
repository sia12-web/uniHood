# Phase 1 – Identity & Profiles Test Plan

## Fixtures
- Campus: C1 { name="UofT", domain="utoronto.ca" }
- Users: none initially
- Email sender mocked; S3 presign mocked; Argon2 functions real or faked with deterministic hash
- Clock fixed (freeze time)

## Unit — policy
1) email domain guard:
	- "a@utoronto.ca" + campus C1 → ok
	- "a@gmail.com" + campus C1 → 400
2) handle rules:
	- invalid chars → 400
	- reserved blocklist (e.g., "admin") → 400
3) rate limits:
	- >20 /auth/register per hour from same IP → 429
	- /auth/resend >3/hour → 429

## Unit — service.register
- Creates user, email_verifications with 24h ttl
- Reserves handle in Redis during flow
- If email exists & unverified:
  - regenerates token and **does not** reveal whether account exists in response

## Unit — verify_email
- Valid token marks `email_verified=true`, sets `used_at`
- Expired or reused token → 410 Gone

## Unit — login
- Wrong password → 401
- Correct → returns access+refresh tokens
- Rate limit exceeded → 429

## Unit — profile patch
- Update display_name/bio/privacy/status within limits
- Handle change:
  - conflicts → 409
  - passes → updates and remains lowercase

## Integration — avatar upload
- presign returns url+key; commit with wrong prefix → 403
- commit success updates `avatar_key` and ProfileOut avatar_url derivation

## API
- POST /auth/register → 200 (sanitized response)
- POST /auth/verify-email → 200
- POST /auth/login → 200 with tokens
- GET /profile/me (auth) → 200 ProfileOut
- PATCH /profile/me (auth) → 200 with updated fields
- POST /profile/avatar/presign/commit (auth) → 200

## Security/Privacy
- Emails & tokens never echoed back in logs or errors
- Generic responses for account existence checks
- JWT-protected routes require auth; unauth → 401

## E2E (Playwright)
- Register with campus email → see “Check your email”
- Visit verify link (mock) → account verified
- Login → land in settings/profile; update fields; upload avatar (mock) → commit

## Performance (local)
- /auth/register P95 < 120ms
- /profile/me P95 < 80ms
