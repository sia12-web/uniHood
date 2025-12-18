BEGIN;

-- Stores lifetime game/activity counters for leaderboards.
-- This is queried by /leaderboards/me/summary and updated by /leaderboards/record-outcome.
CREATE TABLE IF NOT EXISTS user_game_stats (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_key TEXT NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_user_game_stats_user_id
  ON user_game_stats (user_id);

COMMIT;
