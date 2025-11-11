-- Phase 6: moderator actions catalog

CREATE TABLE IF NOT EXISTS mod_action_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    version INT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('atomic', 'macro')),
    spec JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (key, version)
);
