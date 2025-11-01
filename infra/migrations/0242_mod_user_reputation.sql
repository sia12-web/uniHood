-- Phase 5: aggregated user reputation
CREATE TABLE IF NOT EXISTS mod_user_reputation (
    user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    score SMALLINT NOT NULL DEFAULT 50,
    last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    band TEXT NOT NULL DEFAULT 'neutral'
);

CREATE INDEX IF NOT EXISTS idx_mod_user_reputation_band ON mod_user_reputation(band);
