-- Communities phase 1: core group tables
CREATE TABLE IF NOT EXISTS group_entity (
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_group_campus
    ON group_entity(campus_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_visibility
    ON group_entity(visibility)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_tags_gin
    ON group_entity USING GIN (tags);

CREATE TABLE IF NOT EXISTS group_member (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','admin','moderator','member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    muted_until TIMESTAMPTZ NULL,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_group
    ON group_member(group_id);

CREATE INDEX IF NOT EXISTS idx_member_user
    ON group_member(user_id);
