-- Phase 7 — Search & Discovery indexes

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users search helpers
CREATE INDEX IF NOT EXISTS idx_users_trgm_handle ON users USING gin (handle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_trgm_display ON users USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_campus ON users (campus_id);

-- Room discovery helpers
CREATE INDEX IF NOT EXISTS idx_rooms_trgm_name ON rooms USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rooms_campus ON rooms (campus_id);
