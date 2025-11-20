BEGIN;

CREATE TABLE IF NOT EXISTS lb_daily (
  ymd INTEGER NOT NULL,
  campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social DOUBLE PRECISION NOT NULL DEFAULT 0,
  engagement DOUBLE PRECISION NOT NULL DEFAULT 0,
  popularity DOUBLE PRECISION NOT NULL DEFAULT 0,
  overall DOUBLE PRECISION NOT NULL DEFAULT 0,
  rank_overall INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ymd, campus_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_daily_campus_ymd
  ON lb_daily (campus_id, ymd);

CREATE TABLE IF NOT EXISTS streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_active_ymd INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  earned_ymd INTEGER NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, earned_ymd)
);

CREATE INDEX IF NOT EXISTS idx_badges_user_earned
  ON badges (user_id, earned_ymd DESC);

COMMIT;
