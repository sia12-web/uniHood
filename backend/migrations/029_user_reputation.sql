ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score FLOAT DEFAULT 0.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- Index for top rated users?
CREATE INDEX IF NOT EXISTS idx_users_reputation ON users(reputation_score DESC);
