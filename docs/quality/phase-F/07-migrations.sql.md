-- PEOPLE
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_handle_trgm ON users USING gin (handle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_display_trgm ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_bio_fts ON users USING gin (to_tsvector('english', coalesce(bio,'')));
-- If interests/skills in JSONB:
-- CREATE INDEX IF NOT EXISTS idx_users_interests_gin ON users USING gin ((privacy->'interests'));
-- adjust to your actual schema

-- ROOMS
CREATE INDEX IF NOT EXISTS idx_rooms_title_trgm ON rooms USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rooms_fts ON rooms USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(topic,'') || ' ' || coalesce(description,'')));

-- POSTS (communities)
CREATE INDEX IF NOT EXISTS idx_posts_fts ON posts USING gin (to_tsvector('english', coalesce(text,'')));
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin ON posts USING gin (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_posts_created_id ON posts (created_at DESC, id);
