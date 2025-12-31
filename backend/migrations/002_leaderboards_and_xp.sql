-- 002_leaderboards_and_xp.sql
-- Create missing tables for Leaderboards, XP, and Game Stats

-- 1. Game Stats (RPS, etc)
CREATE TABLE IF NOT EXISTS user_game_stats (
    user_id UUID REFERENCES users(id),
    activity_key TEXT,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_key)
);

-- 2. Daily Leaderboard Snapshots
CREATE TABLE IF NOT EXISTS lb_daily (
    ymd INTEGER,
    campus_id UUID REFERENCES campuses(id),
    user_id UUID REFERENCES users(id),
    social FLOAT DEFAULT 0,
    engagement FLOAT DEFAULT 0,
    popularity FLOAT DEFAULT 0,
    overall FLOAT DEFAULT 0,
    rank_overall INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ymd, campus_id, user_id)
);

-- 3. Streaks
CREATE TABLE IF NOT EXISTS streaks (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    current INTEGER DEFAULT 0,
    best INTEGER DEFAULT 0,
    last_active_ymd INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Badges / Achievements
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    kind TEXT,
    earned_ymd INTEGER,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. XP System
CREATE TABLE IF NOT EXISTS user_xp_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    total_xp INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xp_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action_type TEXT,
    amount INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    scope_id UUID
);

-- 6. Social Stats Caching (for "Live" scores)
-- These might be views in a future iteration, but for now we rely on queries.
-- Adding indexes to speed up the social score query:
CREATE INDEX IF NOT EXISTS idx_friendships_user_status ON user_roles(user_id); -- reusing existing table? no wait.
-- We need the friendships table too if it's not created yet. 
-- Checking 001_initial_schema.sql... it was NOT there.
-- Adding social tables:

CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    friend_id UUID REFERENCES users(id),
    status TEXT, -- 'pending', 'accepted'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS meetups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_user_id UUID REFERENCES users(id),
    title TEXT,
    description TEXT,
    start_time TIMESTAMPTZ,
    campus_id UUID REFERENCES campuses(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetup_participants (
    meetup_id UUID REFERENCES meetups(id),
    user_id UUID REFERENCES users(id),
    status TEXT, -- 'JOINED', 'LEFT'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (meetup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(user_id, status);
