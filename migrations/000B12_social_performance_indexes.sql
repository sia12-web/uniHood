-- Migration: Add performance indexes for social queries
-- Date: 2025-12-06
-- Purpose: Optimize /friends/list endpoint (P95 was 5000ms, target <400ms)

BEGIN;

-- Covering index for friends list query
-- Query: SELECT f.*, u.handle, u.display_name FROM friendships f JOIN users u ON u.id = f.friend_id
--        WHERE f.user_id = $1 AND f.status = $2 ORDER BY f.created_at DESC
-- This index covers the WHERE clause and ORDER BY, eliminating the need for a sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_user_status_created
    ON friendships (user_id, status, created_at DESC);

-- Index to speed up the JOIN on users table
-- The friends query joins users ON u.id = f.friend_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_id_handle_display
    ON users (id) INCLUDE (handle, display_name);

-- Index for invite inbox queries (also frequently slow)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_to_status_created
    ON invitations (to_user_id, status, created_at DESC);

-- Index for invite outbox queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_from_status_created
    ON invitations (from_user_id, status, created_at DESC);

COMMIT;
