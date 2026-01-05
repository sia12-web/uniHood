-- Migration 035: Security Performance Indexes
-- Purpose: Optimize session lookups and audit log queries

-- 1. Session Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_revoked ON sessions(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- 2. Audit Log Composite Index
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
