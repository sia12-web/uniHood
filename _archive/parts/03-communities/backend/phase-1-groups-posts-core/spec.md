# Communities · Backend Phase 1 — Groups & Posts Core

## 0) Goals / Non-Goals
- **Goals**: Establish the core data model and APIs for communities. Ship CRUD flows for groups, membership, posts, comments, reactions, tags, media uploads, and realtime hooks (outbox, Redis Streams, Socket.IO). Enforce soft-deletion, role-based authorization, and keyset pagination.
- **Non-Goals**: Feed ranking, events/RSVPs, advanced search, moderation ML, or long-term analytics. These land in later phases.

## 1) Domain Model (PostgreSQL 16)
- `uuid` primary keys (v7 emulation or `uuid_generate_v4()`), with `(created_at, id)` ordering.
- Soft-delete via `deleted_at TIMESTAMPTZ NULL`.
- Audit columns: `created_at`, `updated_at`, `created_by`.
- Campus scoping (`campus_id` FK to Identity service), nullable for global.
- Group visibility: `public`, `private`, `secret`.
- Member roles: `owner`, `admin`, `moderator`, `member`.

### 1.1 Tables
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE group_entity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','secret')),
  avatar_key TEXT NULL,
  cover_key TEXT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_group_campus ON group_entity(campus_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_group_visibility ON group_entity(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_group_tags_gin ON group_entity USING GIN (tags);

CREATE TABLE group_member (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','moderator','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted_until TIMESTAMPTZ NULL,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_member_group ON group_member(group_id);
CREATE INDEX idx_member_user ON group_member(user_id);

CREATE TABLE topic_tag (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tag TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  title TEXT NULL,
  body TEXT NOT NULL,
  topic_tags TEXT[] NOT NULL DEFAULT '{}',
  media_count SMALLINT NOT NULL DEFAULT 0,
  reactions_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_post_group_created ON post(group_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_post_author ON post(author_id) WHERE deleted_at IS NULL;

CREATE TABLE comment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  parent_id UUID NULL REFERENCES comment(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
  reactions_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_comment_post_created ON comment(post_id, created_at ASC, id) WHERE deleted_at IS NULL;

CREATE TABLE reaction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment')),
  subject_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id, user_id, emoji)
);

CREATE INDEX idx_reaction_subject ON reaction(subject_type, subject_id);

CREATE TABLE media_attachment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment','group')),
  subject_id UUID NOT NULL,
  s3_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  width INT NULL,
  height INT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_event (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_outbox_unprocessed ON outbox_event(processed_at) WHERE processed_at IS NULL;
```

### 1.2 Counter Integrity
- `post.comments_count` increments/decrements atomically with comment lifecycle.
- Count fields never drop below zero.

## 2) Authorization & Visibility
- `public`: anyone can view; posting requires membership by default.
- `private`: membership required to view/post.
- `secret`: non-discoverable; invite only.
- `group.is_locked` blocks new posts.
- Role guardrails:
  - Owner/Admin: manage group, ban/unban, pin.
  - Moderator: pin/unpin, moderate posts/comments.
  - Member: create posts/comments, react.
- Soft-delete returns 404 for non-moderators.

## 3) API (FastAPI)
- Base path `/api/communities/v1`.
- Auth via Bearer JWT; inject `current_user`.
- Idempotency via header `Idempotency-Key` stored in Redis (24h TTL).
- Pagination: keyset over `(created_at, id)` with `before`/`after` cursors.

### 3.1 Endpoint Summary
- Groups CRUD, membership admin, posts/comments CRUD, reactions, uploads, attachments, tags.
- Pin/unpin posts, soft delete respect roles.

### 3.2 DTO Sketches
```ts
type Group = {
  id: string; name: string; slug: string;
  visibility: 'public'|'private'|'secret';
  campus_id?: string | null;
  avatar_url?: string | null;
  tags: string[];
  is_locked: boolean;
  created_at: string; updated_at: string;
  role?: 'owner'|'admin'|'moderator'|'member'|null;
};

type Post = {
  id: string; group_id: string; author_id: string;
  title?: string | null; body: string;
  topic_tags: string[]; media: Media[];
  reactions_count: number; comments_count: number; is_pinned: boolean;
  created_at: string; updated_at: string; deleted_at?: string | null;
};

```

## 4) S3 Pre-signed Upload Flow
1. Client requests `POST /uploads/presign` with mime, size, purpose.
2. Server validates, returns presigned URL + key.
3. Client uploads to S3, then `POST /attachments` to link.
4. Attachment increments `media_count`.

## 5) OpenSearch Outbox
- Write to `outbox_event` inside transactions.
- Worker polls unprocessed rows, transforms, bulk indexes, and marks `processed_at`.
- DLQ after repeated failure.

## 6) Redis Streams & Socket.IO
- `comm:post` and `comm:comment` Redis streams capture events.
- Stream emitter pushes Socket.IO events to `/groups/{id}` and `/posts/{id}` namespaces.
- Idempotent on stream IDs.

## 7) Keyset Pagination
- Use base64 cursors encoding `(created_at, id)`.
- List queries fetch `LIMIT + 1` rows to determine `next_cursor`.

## 8) Validation & Limits
- Post title ≤ 140 chars; body ≤ 40k; comment body ≤ 10k.
- Attachments: ≤10 per post, ≤3 per comment; mime whitelist.*
- Reactions enforce unique `(subject_type, subject_id, user_id, emoji)`.

## 9) Error Model
- 400 validation, 401 unauthenticated, 403 forbidden, 404 not found/invisible, 409 idempotency conflict or duplicate reaction, 422 attachment mismatch.
- Soft-deleted resources return 404 to non-admins.

## 10) FastAPI Structure
```
app/
  communities/
    api/
      groups.py, members.py, posts.py, comments.py, reactions.py, uploads.py, attachments.py
    domain/
      policies.py, services.py, repo.py, models.py, events.py
    workers/
      outbox_indexer.py, stream_emitter.py
    schemas/
      dto.py
    infra/
      s3.py, redis.py, opensearch.py, idempotency.py
```

## 11) Critical Path Pseudocode
- Post creation: policy check, DB insert in transaction, outbox write, Redis stream emit.
- Reaction add: insert unique, counter bump, outbox, stream emit.
- Presign upload: validate + S3 signer.
- Outbox worker: poll, bulk index, mark processed.

## 12) Seed Fixtures
- 3 groups (public/private/secret) with campus associations.
- Mixed membership roles across 10 users.
- 20 posts, 50 comments, sample reactions.
- Prefilled topic tags, media keys.

## 13) Observability
- Prometheus counters for create flows, outbox processed/failures.
- Structured JSON logs (request id, user id, group id).
```