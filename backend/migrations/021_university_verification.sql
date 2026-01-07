-- Add university verification status to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_university_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Create table for storing university verification codes
CREATE TABLE IF NOT EXISTS university_verifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_university_verifications_user_id ON university_verifications(user_id);
