# Phase 3 — Identity & Profiles (Privacy & Account Management)

Goal: user-controlled privacy settings, account export, deletion (GDPR-style), audit log view, and notification preferences. Extends the identity module for long-term data hygiene and transparency.

## 0) Directory (adds)
backend/
  app/
    api/privacy.py
    domain/identity/
      privacy.py        # visibility, discovery, blocklist
      export.py         # data export archive
      deletion.py       # account deletion workflow
      audit.py          # fetch audit logs
      notifications.py  # preferences CRUD
frontend/
  app/(identity)/
    settings/privacy/page.tsx
    settings/notifications/page.tsx
    settings/account/page.tsx
  components/
    PrivacyForm.tsx
    NotificationToggles.tsx
  lib/privacy.ts

## 1) Data Model (PostgreSQL 16)

-- blocklist: mutual exclusion
create table if not exists blocks (
  user_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
create index if not exists idx_blocks_blocked on blocks(blocked_id);

-- notifications preferences
create table if not exists notification_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  prefs jsonb not null default jsonb_build_object(
    'invites',true,'friends',true,'chat',true,'rooms',true,'activities',true
  ),
  updated_at timestamptz not null default now()
);

-- audit log (append-only)
create table if not exists audit_log (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  event text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user on audit_log(user_id);

-- deletions
create table if not exists account_deletions (
  user_id uuid primary key references users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  purged_at timestamptz
);

## 2) Redis

Keys:
- `rl:privacy:update:{user}:{minute}` ≤ 6/min
- `export:job:{user}` -> job metadata (expire 24h)
- `delete:confirm:{user}` -> token for deletion confirm (ttl 24h)

## 3) Privacy Controls

`PATCH /settings/privacy`  
Fields:


visibility: "everyone"|"friends"|"none"
ghost_mode: boolean
discoverable_by_email: boolean
show_online_status: boolean
share_activity: boolean


Policy:
- `"none"` removes from search/discovery entirely.
- `ghost_mode=true` hides last seen and status.
- Changing privacy logs event `"privacy_change"`.

## 4) Block/Unblock

POST `/privacy/block/{user_id}`  
DELETE `/privacy/block/{user_id}`  
Rules:
- Cannot block yourself.
- Blocking auto-removes friendship (if exists) and prevents new invites/messages.
- Unblock removes record.

## 5) Notification Preferences

GET `/settings/notifications`  
PATCH `/settings/notifications`  
JSON schema: `{ invites?:bool, friends?:bool, chat?:bool, rooms?:bool, activities?:bool }`.

## 6) Data Export

POST `/account/export/request`  
GET  `/account/export/status`  
GET  `/account/export/download` (temporary S3 signed URL)

- Generates a ZIP of user data (profile.json, friends.json, rooms.json, messages.json, etc.).  
- Queue job to compile data asynchronously → upload to S3 `exports/{user_id}/{ts}.zip`.  
- TTL 24h.  
- Logs event `"export_requested"`.

## 7) Account Deletion

POST `/account/delete/request`  
POST `/account/delete/confirm { token }`  
- First call issues token via email.  
- Confirm → anonymize user data, purge personal fields, mark `account_deletions.confirmed_at`.  
- Background job purges associations after 7 days grace.

## 8) Audit Log View

GET `/account/audit?limit=50&cursor=?`  
Returns recent actions: login, 2FA, privacy changes, exports, deletions, etc. (from `audit_log`).

## 9) Observability

Counters:
- `identity_privacy_update_total`
- `identity_block_total{action}`
- `identity_export_request_total`
- `identity_delete_request_total`
- `identity_delete_confirm_total`

## 10) Frontend Flows

- **Privacy Settings:** toggle switches for visibility, ghost mode, etc.
- **Notifications:** toggles for categories.
- **Account:**  
  - Export data → spinner → download link.  
  - Delete account → confirmation modal → email token step.  
  - View audit log table (most recent 50).
