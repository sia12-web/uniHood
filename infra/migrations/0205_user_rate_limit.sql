CREATE TABLE IF NOT EXISTS user_rate_limit (
    user_id UUID PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL,
    counters JSONB NOT NULL DEFAULT '{}'::jsonb
);
