# Phase 3 Privacy & Account Management — Test Plan

## Fixtures
- Users: u1,u2 friends
- Redis mocked, email sender mocked, S3 mock for export
- Freeze time for audit assertions

## Unit — privacy
- PATCH /settings/privacy changes fields; rate limit 6/min enforced
- ghost_mode=true hides user in discovery (Phase 1 & 7 integration)
- audit log entry created

## Unit — blocklist
- POST /privacy/block/u2 inserts record; duplicate → 409
- DELETE removes; blocking removes friendship row; prevents new invites/messages (simulate call to invites service mock)
- audit event "block"

## Unit — notifications
- PATCH toggles flags; returns updated prefs; audit event recorded

## Unit — export
- request → export job created in Redis, status pending → after worker completes, status=ready + s3 url returned
- expired job → 410 Gone
- audit event logged

## Unit — deletion
- request → email token saved in Redis
- confirm(token) → sets confirmed_at; marks user anonymized
- repeated confirm → 409
- purge job removes user data; audit event "delete_confirmed"

## Unit — audit log
- /account/audit returns <=50 rows sorted desc by created_at
- cursor pagination works

## Integration
- privacy+block: blocked user cannot message/invite
- export→download zip contains expected JSON files

## Security
- Only owner can read/write own privacy, notifications, export, deletion
- Tokens for deletion one-time, expire after 24h
- Exports cleaned up after 24h

## Performance
- privacy patch <100ms
- export job runs <5s for user with <1k messages
