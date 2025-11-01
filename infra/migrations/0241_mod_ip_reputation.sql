-- Phase 5: IP reputation store
CREATE TABLE IF NOT EXISTS mod_ip_reputation (
    ip INET PRIMARY KEY,
    asn INT NULL,
    risk_label TEXT NOT NULL DEFAULT 'unknown',
    score SMALLINT NOT NULL DEFAULT 50,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_ip_reputation_updated_at ON mod_ip_reputation(updated_at DESC);
