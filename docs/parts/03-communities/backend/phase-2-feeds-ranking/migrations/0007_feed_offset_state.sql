CREATE TABLE IF NOT EXISTS feed_offset_state (
	owner_id UUID PRIMARY KEY,
	last_posted_at TIMESTAMPTZ NULL,
	last_id BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_offset_last_posted
	ON feed_offset_state(last_posted_at DESC NULLS LAST);
