-- Phase 5: restriction ledger
CREATE TABLE IF NOT EXISTS mod_user_restriction (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    mode TEXT NOT NULL,
    reason TEXT NOT NULL,
    ttl_seconds INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NULL,
    expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_mod_user_restriction_user ON mod_user_restriction(user_id);
CREATE INDEX IF NOT EXISTS idx_mod_user_restriction_scope ON mod_user_restriction(scope);
