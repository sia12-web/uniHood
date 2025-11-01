-- Phase 1: Communities core — group membership table

CREATE TABLE IF NOT EXISTS group_member (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
	user_id UUID NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('owner','admin','moderator','member')),
	joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	muted_until TIMESTAMPTZ NULL,
	is_banned BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_group
	ON group_member(group_id);

CREATE INDEX IF NOT EXISTS idx_member_user
	ON group_member(user_id);
