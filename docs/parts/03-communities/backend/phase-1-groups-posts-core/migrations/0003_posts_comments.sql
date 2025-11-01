-- Phase 1: Communities core — posts and comments

CREATE TABLE IF NOT EXISTS post (
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

CREATE INDEX IF NOT EXISTS idx_post_group_created
	ON post(group_id, created_at DESC, id)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_post_author
	ON post(author_id)
	WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS comment (
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

CREATE INDEX IF NOT EXISTS idx_comment_post_created
	ON comment(post_id, created_at ASC, id)
	WHERE deleted_at IS NULL;
