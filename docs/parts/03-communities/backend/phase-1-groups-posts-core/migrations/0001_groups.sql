
-- Phase 1: Communities core — group primitives and tags
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_group_campus
	ON group_entity(campus_id)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_visibility
	ON group_entity(visibility)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_tags_gin
	ON group_entity
	USING GIN (tags);

CREATE TABLE IF NOT EXISTS topic_tag (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	tag TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
