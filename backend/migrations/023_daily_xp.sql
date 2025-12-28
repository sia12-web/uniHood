-- Migration 023: Daily Login XP Tracking
CREATE TABLE IF NOT EXISTS daily_xp_claims (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, claim_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_xp_user_date ON daily_xp_claims(user_id, claim_date);
