# spec.md — Communities · Backend Phase 1 — Groups & Posts Core

<details>
<summary>Click to expand full Phase 1 spec</summary>

## 0) Goals / Non-Goals
- Goals: core data model, CRUD APIs, membership & visibility checks, media upload flow, reactions, tags, indexing hooks, realtime events.
- Non-Goals: feed ranking, events/RSVPs, advanced search, moderation ML (handled in later parts).

## 1) Domain Model (PostgreSQL 16)
- Conventions:
  - `id` = `uuid` (v7 emulated w/ server gen or std `uuid_generate_v4()`; ordering by `(created_at, id)`).
  - Soft-delete via `deleted_at TIMESTAMPTZ NULL`.
  - Row-level audit fields: `created_at`, `updated_at`, `created_by`.
  - Campus scoping: `campus_id UUID` (FK to Identity service `campus`); nullable for global.
  - Visibility: `public`, `private`, `secret`.
  - Role: `owner`, `admin`, `moderator`, `member`.

### 1.1 Tables
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE group_entity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NULL, -- FK to identity.campus(id)
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  slug TEXT NOT NULL UNIQUE, -- kebab
  description TEXT DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','secret')),
  avatar_key TEXT NULL, -- S3 key
  cover_key TEXT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- no new posts if true
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL, -- user id
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
  author_id UUID NOT NULL, -- user id
  title TEXT NULL,
  body TEXT NOT NULL,
  topic_tags TEXT[] NOT NULL DEFAULT '{}', -- denorm of topic_tag.tag
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
  size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600), -- 100MB
  width INT NULL,
  height INT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outbox for async index & notifications (transactional outbox pattern)
CREATE TABLE outbox_event (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL, -- 'group' | 'post' | 'comment' | 'reaction'
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,     -- 'created' | 'updated' | 'deleted'
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_outbox_unprocessed ON outbox_event(processed_at) WHERE processed_at IS NULL;
```

...existing code...

</details>
