-- Phase 5: reputation events ledger
CREATE TABLE IF NOT EXISTS mod_reputation_event (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fp TEXT NULL,
    ip INET NULL,
    surface TEXT NOT NULL,
    kind TEXT NOT NULL,
    delta SMALLINT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_reputation_event_user_created_at ON mod_reputation_event(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_reputation_event_kind ON mod_reputation_event(kind);
