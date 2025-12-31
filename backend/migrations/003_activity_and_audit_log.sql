-- Audit Log and Activity tables missing from initial migrations

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Mini-activities core tables
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY,
    kind VARCHAR(50) NOT NULL,
    convo_id VARCHAR(100) NOT NULL,
    user_a UUID NOT NULL REFERENCES users(id),
    user_b UUID NOT NULL REFERENCES users(id),
    state VARCHAR(20) NOT NULL DEFAULT 'lobby',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS activity_rounds (
    id UUID PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    idx INT NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'pending',
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}',
    UNIQUE(activity_id, idx)
);

CREATE TABLE IF NOT EXISTS typing_submissions (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS story_lines (
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    idx INT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, idx)
);

CREATE TABLE IF NOT EXISTS trivia_answers (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    choice_idx INT NOT NULL,
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS rps_moves (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    commit_hash TEXT,
    choice VARCHAR(20),
    nonce TEXT,
    phase VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (round_id, user_id)
);
