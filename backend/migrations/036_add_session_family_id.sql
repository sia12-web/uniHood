-- Migration 036: Session Family Guard
-- Purpose: Add session_family_id for granular revocation (v2.2.1)

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS family_id UUID DEFAULT uuid_generate_v4();
CREATE INDEX IF NOT EXISTS idx_sessions_family_id ON sessions(family_id);

-- Update revoke_session to optionally take family_id logic later
