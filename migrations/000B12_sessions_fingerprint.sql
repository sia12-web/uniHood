-- Add fingerprint_hash column to sessions for device binding validation
-- Per S1-backend-01-authentication.md: refresh tokens must be bound to device fingerprint

ALTER TABLE sessions ADD COLUMN fingerprint_hash TEXT;

-- Index for faster lookups during refresh token validation
CREATE INDEX idx_sessions_fingerprint_hash ON sessions (fingerprint_hash) WHERE fingerprint_hash IS NOT NULL;

COMMENT ON COLUMN sessions.fingerprint_hash IS 'SHA-256 hash of device fingerprint cookie, validated on refresh token use';
