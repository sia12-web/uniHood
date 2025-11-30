BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS flag_overrides (
    key TEXT NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
    user_id UUID,
    campus_id UUID,
    value JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_flag_overrides UNIQUE (key, user_id, campus_id)
);

CREATE INDEX IF NOT EXISTS idx_flag_overrides_key ON flag_overrides(key);

COMMIT;
