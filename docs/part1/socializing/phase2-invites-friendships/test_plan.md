# Phase 2 — Invites & Friendships Test Plan

## Fixtures
- Users: u1, u2, u3
- No friendships initially; no invites
- Rate limits reset; Socket test client subscribed to user rooms

## Unit Tests (policy.py / service.py)
1. send_invite:
	 - reject self-invite
	 - reject if blocked either way
	 - reject if already friends
	 - create 'sent' with 7d expiry
	 - reciprocal open invite triggers auto-accept (creates friendships both ways; both invites become accepted)
2. accept_invite:
	 - only recipient can accept
	 - cannot accept expired or non-sent
	 - creates/upserts symmetric friendships; cancels others
3. decline_invite / cancel_invite:
	 - role enforcement (recipient vs sender)
	 - status transitions correct
4. block/unblock:
	 - creates directional 'blocked'; cancels open invites
	 - unblock removes blocked row
5. rate limits:
	 - >15 sends in a minute → 429
	 - >200 sends in a day → 429

## DB Integration (Postgres)
- unique(from,to,status='sent') prevents dupes
- symmetric friendships present after accept (u1→u2 and u2→u1 = accepted)
- blocking is directional: A blocks B, but not vice versa
- accepting cancels all other open invites between pair

## API Tests (FastAPI)
- POST /invites/send:
	- 200 with summary; socket emits invite:new to recipient
	- 409 if already sent (same direction)
	- auto-accept path when reverse already sent
- POST /invites/{id}/accept:
	- 200; both friendships accepted; socket friend:update to both
	- 403 if wrong user
	- 410 if expired or not 'sent'
- POST /invites/{id}/decline and /cancel:
	- status changes + socket updates
- GET /invites/inbox & /outbox:
	- only 'sent' visible in correct box
- GET /friends/list:
	- filter=accepted shows symmetric friends
	- filter=blocked shows only directional blocked rows (me→target)
- POST /friends/{user_id}/block|unblock:
	- 200 + correct list movements

## Socket.IO (ASGI test)
- subscribe self room; upon send_invite → recipient gets invite:new
- accept → both get friend:update {accepted}
- block → both get friend:update; ensure sender doesn’t receive further invites from target

## E2E (Playwright)
- u1 visits proximity page → clicks "Invite" on u2
- u2 opens inbox → sees invite → Accept
- u1 friends page reflects u2; block u2 → u2 disappears from accepted and cannot invite u1

## Security/Privacy
- Ensure no email/PII leaks
- 401 for unauthenticated
- 403 on cross-user operations not allowed

## Metrics/Streams
- counters increment; events appended to `x:invites.events` and `x:friendships.events`
