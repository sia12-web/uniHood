-- Phase 2 supplemental: search indexes and reaction weighting for Phase F

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Post search improvements
CREATE INDEX IF NOT EXISTS idx_posts_fts ON post USING gin (to_tsvector('english', coalesce(body,'')));
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin ON post USING gin (topic_tags);
CREATE INDEX IF NOT EXISTS idx_posts_created_id ON post (created_at DESC, id);

-- Reaction weighting column used by anti-gaming logic
ALTER TABLE reaction
	ADD COLUMN IF NOT EXISTS effective_weight DOUBLE PRECISION NOT NULL DEFAULT 1.0;
