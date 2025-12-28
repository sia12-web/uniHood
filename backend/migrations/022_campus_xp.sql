-- Campus XP System Tables

-- Stores the current aggregate state for each user
CREATE TABLE IF NOT EXISTS user_xp_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp BIGINT NOT NULL DEFAULT 0,
    current_level INT NOT NULL DEFAULT 1,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stores the immutable history of XP awards
CREATE TABLE IF NOT EXISTS xp_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    amount INT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_xp_events_user_id ON xp_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_xp_stats_total_xp ON user_xp_stats(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_xp_stats_level ON user_xp_stats(current_level DESC);
