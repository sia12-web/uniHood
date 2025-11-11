-- Phase F: search indexes and reaction weighting

BEGIN;

-- Ensure trigram extension exists for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- PEOPLE
CREATE INDEX IF NOT EXISTS idx_users_handle_trgm ON users USING gin (handle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_display_trgm ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_bio_fts ON users USING gin (to_tsvector('english', coalesce(bio,'')));

-- ROOMS
CREATE INDEX IF NOT EXISTS idx_rooms_title_trgm ON rooms USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rooms_name_fts ON rooms USING gin (to_tsvector('english', coalesce(name,'')));

-- POSTS
CREATE INDEX IF NOT EXISTS idx_posts_fts ON post USING gin (to_tsvector('english', coalesce(body,'')));
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin ON post USING gin (topic_tags);
CREATE INDEX IF NOT EXISTS idx_posts_created_id ON post (created_at DESC, id);

-- Reaction weighting column for anti-gaming controls
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = 'reaction'
	) THEN
		ALTER TABLE reaction
			ADD COLUMN IF NOT EXISTS effective_weight DOUBLE PRECISION NOT NULL DEFAULT 1.0;
	END IF;
END$$;

COMMIT;
