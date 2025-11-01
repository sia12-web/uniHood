## Core Algorithms (service.py)

### send_invite
def send_invite(me, to_user_id, campus_id):
	assert_rl(me.id, per_min=15, per_day=200)
	guard_not_self(me.id, to_user_id)
	guard_not_blocked_either_way(me.id, to_user_id)
	if are_friends(me.id, to_user_id): raise Conflict

	open_ab = get_open_invite(me.id, to_user_id)
	open_ba = get_open_invite(to_user_id, me.id)

	if open_ab: raise ConflictAlreadySent(open_ab.id)

	expires = now()+7d
	if open_ba:
		# auto-accept mutual interest
		tx:
			update invitations set status='accepted' where id=open_ba.id
			create_invitation(id=new_uuid, from=me.id, to=to_user_id, status='accepted', expires_at=expires)
			upsert_friendships_bidirectional(me.id, to_user_id)
			cancel_other_open_between_pair(me.id, to_user_id, exclude=[open_ba.id])
			notify both: friend:update accepted
		return accepted summary
	else:
		inv_id = insert_invitation(me.id, to_user_id, 'sent', expires)
		emit to room user:{to_user_id} => invite:new {inv_id,...}
		return sent summary

### accept_invite
def accept_invite(me, invite_id):
	inv = load(invite_id)
	if inv.to_user_id != me.id: raise Forbidden
	if inv.status != 'sent' or inv.expires_at < now(): raise Gone
	tx:
		update invitations set status='accepted' where id=invite_id
		upsert_friendships_bidirectional(inv.from_user_id, inv.to_user_id)
		cancel_other_open_between_pair(inv.from_user_id, inv.to_user_id, exclude=[invite_id])
		emit friend:update to both
	return summary

### decline_invite / cancel_invite
def decline_invite(me, invite_id):
	inv = load(invite_id); assert inv.to_user_id==me.id and inv.status=='sent'
	update invitations set status='declined'; notify sender

def cancel_invite(me, invite_id):
	inv = load(invite_id); assert inv.from_user_id==me.id and inv.status=='sent'
	update invitations set status='cancelled'; notify recipient

### block_user / unblock_user
def block_user(me, target_id):
	tx:
		upsert friendship (me, target_id, 'blocked')
		cancel_all_invites_between(me, target_id)
		emit friend:update to both
	return ok

def unblock_user(me, target_id):
	delete friendship where (me, target_id, 'blocked')
	emit friend:update(me->target, status='none')

## Responses (privacy)
- Never return emails/PII.
- Invite payloads show only ids/timestamps/status.
- Friend list items include minimal `UserLite` (from Phase 1 schemas) via batch lookup.

## Observability
- Metrics:
  - `invites_sent_total`
  - `invites_accept_total`
  - `friendships_accepted_total`
  - `blocks_total`
  - `invite_send_rejects_total{reason}`
- Streams already defined.

## Frontend Flows

### Invites Inbox/Outbox
- Fetch `/invites/inbox` on page load (SWR).
- Socket join `user:{me.id}`; on `invite:new` push to inbox.
- Actions:
  - Accept → POST accept → optimistic remove from inbox; toast success.
  - Decline → POST decline → remove.

### Send Invite from Proximity List
- Button "Invite" next to user → POST `/invites/send`.
- Handle 409 (already invited) and auto-accept path (UI shows "Now friends").

### Friends List
- Fetch `/friends/list?filter=accepted`.
- Block/unblock from actions menu:
  - Block → POST block → remove from accepted and add to blocked tab.
  - Unblock → POST unblock → remove from blocked; no auto-friend.

## Constants
- INVITE_EXPIRES_DAYS = 7
- INVITE_PER_MINUTE = 15
- INVITE_PER_DAY = 200
- BLOCK_PER_MINUTE = 10
# Phase 2 — Invites & Friendships Spec

## Overview

Phase 2 introduces directional invites (send/accept/decline/cancel), a symmetric friendship graph, rate limits, auditable event streams, and Socket.IO notifications for social interactions. The design enforces deduplication, idempotent accept, symmetric friendships, directional blocks, and privacy-safe payloads.

## Directory Structure
backend/
	app/
		api/social.py
		domain/social/
			__init__.py
			models.py          # invitations, friendships
			schemas.py         # DTOs
			service.py         # core flows
			policy.py          # rules (dedupe, block rules, limits)
			sockets.py         # /social namespace
			audit.py           # stream append helpers
frontend/
	app/(social)/
		invites/page.tsx
		friends/page.tsx
		components/InviteInbox.tsx
		components/FriendList.tsx
	lib/social.ts         # REST helpers

## Persistent Model (PostgreSQL 16)

### Invitations
Directional, ephemeral with audit trail.
```sql
create table if not exists invitations (
	id uuid primary key,
	from_user_id uuid not null,
	to_user_id uuid not null,
	campus_id uuid null,
	status text not null check (status in ('sent','accepted','declined','cancelled','expired')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	expires_at timestamptz not null,
	unique (from_user_id, to_user_id, status) where status='sent'
);
```

### Friendships
Symmetric on accept (two rows), directional block.
```sql
create table if not exists friendships (
	user_id uuid not null,
	friend_id uuid not null,
	status text not null check (status in ('pending','accepted','blocked')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (user_id, friend_id)
);
```

Recommended indexes and triggers omitted for brevity.

## Redis (rate limits + streams)

Keys:
- `rl:invite:send:{user_id}:{yyyyMMddHHmm}`  -> INCR/EX 60   (≤ 15/min)
- `rl:invite:daily:{user_id}:{yyyyMMdd}`     -> INCR/EX 86400 (≤ 200/day)
- `rl:block:{user_id}:{minute}`              -> INCR/EX 60    (≤ 10/min)

Streams:
- `x:invites.events` fields: event, invite_id, from, to, status
- `x:friendships.events` fields: event, user_id, friend_id, status

## Socket.IO (/social)

Namespace: `/social`
Rooms:
- `user:{user_id}`  (DM event channel)
Events (server→client):
- `invite:new`       => InviteSummary
- `invite:update`    => {id, status}
- `friend:update`    => {user_id, friend_id, status}  # both directions
Events (client→server): (optional; Phase 2 can be REST-only)
- `subscribe:self`   => joins user room

## REST API (FastAPI)

POST   `/invites/send`
POST   `/invites/{invite_id}/accept`
POST   `/invites/{invite_id}/decline`
POST   `/invites/{invite_id}/cancel`      # sender-only
GET    `/invites/inbox`   (received, status=sent)
GET    `/invites/outbox`  (sent by me, status=sent)

GET    `/friends/list`    ?filter=accepted|blocked|pending (default accepted)
POST   `/friends/{user_id}/block`
POST   `/friends/{user_id}/unblock`

## Schemas (Pydantic)

InviteSendRequest:
```
{
	to_user_id: UUID,
	campus_id?: UUID,
	message?: string  # not stored in Phase 2 (optional no-op)
}
```

InviteSummary:
```
{
	id: UUID,
	from_user_id: UUID,
	to_user_id: UUID,
	status: "sent"|"accepted"|"declined"|"cancelled"|"expired",
	created_at: str, updated_at: str, expires_at: str
}
```

FriendRow:
```
{
	user_id: UUID,
	friend_id: UUID,
	status: "accepted"|"blocked"|"pending",
	created_at: str
}
```

## Policies & Rules (policy.py)

### Pre-checks on send
- cannot invite self
- both users must exist
- if either direction has friendships.status='blocked' → reject 403
- if already friends (accepted both directions) → 409
- if an unexpired invitation exists (A→B or B→A with status='sent'):
	- if reverse exists (B→A, sent): merge by auto-accept
		- create friendships rows (A,B) and (B,A), set both invites to accepted
		- notify both via socket
	- else return 409 "already sent"
- rate limit: ≤ 15/min, ≤ 200/day
- expiry: now + 7 days

### Accept
- only recipient can accept
- invariants: invitation.status='sent' & not expired
- transactional steps:
	1) update invitations set status='accepted'
	2) upsert friendships:
		 - (to_user, from_user, 'accepted'), (from_user, to_user, 'accepted')
		 - delete any pending friendship placeholders if modeled
	3) set any other open invitations between the pair to 'cancelled'
	4) emit socket `friend:update` to both rooms
	5) append `x:invites.events` & `x:friendships.events`

### Decline
- only recipient
- set status='declined'
- notify sender

### Cancel
- only sender; only if status='sent'
- set status='cancelled'
- notify recipient

### Block / Unblock
- block creates/updates row friendships(user_id=me, friend_id=target, status='blocked')
- also ensure any invites in either direction are set to 'cancelled'
- block does NOT auto-remove the reverse accepted row; app logic should hide by union rule:
	- When blocked exists from A→B, relationship considered blocked for both UIs.
- unblock → delete or set status back to 'accepted'? **Choose delete** the blocked row; accepted state must be re-established via invite again.

## Core Algorithms (service.py)

### Send Invite
... (see service.py for implementation details)
