-- Phase 4 Verification v2 schema

BEGIN;

CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('sso', 'doc')),
    state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'expired')),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verifications_user ON verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_state ON verifications(state);

CREATE TABLE IF NOT EXISTS trust_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    trust_level INT NOT NULL DEFAULT 0,
    badge TEXT,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_audit (
    id BIGSERIAL PRIMARY KEY,
    verification_id UUID NOT NULL REFERENCES verifications(id) ON DELETE CASCADE,
    moderator_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
