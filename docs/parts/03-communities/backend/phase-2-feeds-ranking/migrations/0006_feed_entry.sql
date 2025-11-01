CREATE TABLE IF NOT EXISTS feed_entry (
	id BIGSERIAL PRIMARY KEY,
	owner_id UUID NOT NULL,
	post_id UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
	group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
	rank_score DOUBLE PRECISION NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	deleted_at TIMESTAMPTZ NULL,
	UNIQUE(owner_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_owner_rank
	ON feed_entry(owner_id, rank_score DESC, inserted_at DESC, post_id DESC)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feed_post_lookup
	ON feed_entry(post_id)
	WHERE deleted_at IS NULL;
