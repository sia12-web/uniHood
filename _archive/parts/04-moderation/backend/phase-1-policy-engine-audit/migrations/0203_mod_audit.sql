CREATE TABLE IF NOT EXISTS mod_audit (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_audit_created ON mod_audit(created_at DESC);
