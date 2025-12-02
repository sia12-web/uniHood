CREATE TABLE IF NOT EXISTS user_game_stats (
    user_id UUID NOT NULL,
    activity_key VARCHAR(50) NOT NULL,
    games_played INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    points INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    max_streak INT DEFAULT 0,
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_game_stats_points ON user_game_stats(activity_key, points DESC);
