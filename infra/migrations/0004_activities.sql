-- Phase 5 mini-activities tables

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('typing_duel','story_alt','trivia','rps')),
    convo_id TEXT NOT NULL,
    user_a UUID NOT NULL,
    user_b UUID NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('lobby','active','completed','cancelled','expired')) DEFAULT 'lobby',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_activities_convo ON activities(convo_id);
CREATE INDEX IF NOT EXISTS idx_activities_users ON activities(user_a, user_b);

CREATE TABLE IF NOT EXISTS activity_rounds (
    id UUID PRIMARY KEY,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    idx INT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','open','closed','scored')),
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    meta JSONB NOT NULL DEFAULT '{}'::JSONB,
    UNIQUE (activity_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_activity_rounds_activity ON activity_rounds(activity_id);

CREATE TABLE IF NOT EXISTS typing_submissions (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    text TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS story_lines (
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    idx INT NOT NULL,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, idx)
);

CREATE TABLE IF NOT EXISTS trivia_questions (
    id UUID PRIMARY KEY,
    prompt TEXT NOT NULL,
    options TEXT[] NOT NULL,
    correct_idx INT NOT NULL CHECK (correct_idx BETWEEN 0 AND 3)
);

CREATE TABLE IF NOT EXISTS trivia_answers (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    choice_idx INT NOT NULL CHECK (choice_idx BETWEEN 0 AND 3),
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS rps_moves (
    round_id UUID NOT NULL REFERENCES activity_rounds(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    commit_hash TEXT,
    choice TEXT CHECK (choice IN ('rock','paper','scissors')),
    nonce TEXT,
    phase TEXT NOT NULL CHECK (phase IN ('commit','reveal')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rps_moves_round ON rps_moves(round_id);
