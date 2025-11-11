CREATE TABLE IF NOT EXISTS mod_device (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fp_hash TEXT NOT NULL,
    user_agent TEXT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_count INT NOT NULL DEFAULT 1,
    salt_id TEXT NULL,
    UNIQUE (user_id, fp_hash)
);
