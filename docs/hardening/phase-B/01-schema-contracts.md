# Schema Contracts (Authoritative)

## Global rules
- All user-facing rows carry `campus_id UUID NULL` (NULL only when truly global).
- All “list” queries MUST filter by `campus_id` unless the feature explicitly spans campuses.
- Timestamps: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at` with trigger.
- Soft delete: `deleted_at TIMESTAMPTZ NULL` when applicable (see 03-soft-delete-and-retention).

## Entities (MVP baseline)
- users(id UUID PK, email CITEXT UNIQUE, email_verified BOOL, handle CITEXT UNIQUE, display_name TEXT, campus_id UUID FK campuses(id), password_hash TEXT, privacy JSONB, status JSONB, avatar_key TEXT NULL, avatar_url TEXT NULL, created_at, updated_at)
- sessions(id UUID PK, user_id UUID FK users, device_label TEXT, ip TEXT, user_agent TEXT, last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked BOOL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
- messages(id UUID PK, room_id UUID, sender_id UUID, campus_id UUID, kind TEXT, body TEXT, meta JSONB, created_at, deleted_at)
- rooms(id UUID PK, campus_id UUID, kind TEXT, name TEXT, owner_id UUID, created_at, updated_at, deleted_at)
- invitations(id UUID PK, campus_id UUID, from_id UUID, to_id UUID, status TEXT, created_at, decided_at NULL, deleted_at)
- attachments(id UUID PK, message_id UUID, user_id UUID, campus_id UUID, key TEXT, mime TEXT, bytes INT, created_at)
- activity_sessions(id UUID PK, campus_id UUID, type TEXT, host_id UUID, payload JSONB, started_at, ended_at NULL)

(If your live schema differs, this file is the contract your migrations should converge to.)
