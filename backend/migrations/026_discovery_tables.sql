-- Discovery / Dating-Adjacent Tables

-- 1. Discovery Profiles (Extended attributes for matching)
CREATE TABLE IF NOT EXISTS user_discovery_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    core_identity JSONB DEFAULT '{}',
    personality JSONB DEFAULT '{}',
    campus_life JSONB DEFAULT '{}',
    dating_adjacent JSONB DEFAULT '{}',
    taste JSONB DEFAULT '{}',
    playful JSONB DEFAULT '{}',
    auto_tags TEXT[] DEFAULT '{}',
    compatibility_signals TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Discovery Interactions (Likes/Passes)
CREATE TABLE IF NOT EXISTS discovery_interactions (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL CHECK (action IN ('like', 'pass')),
    cursor_token TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_interactions_user ON discovery_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_interactions_target_like ON discovery_interactions(target_id) WHERE action = 'like';

-- 3. Discovery Matches (Mutual Likes)
CREATE TABLE IF NOT EXISTS discovery_matches (
    user_a UUID REFERENCES users(id) ON DELETE CASCADE,
    user_b UUID REFERENCES users(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ DEFAULT NOW(),
    unmatched_at TIMESTAMPTZ,
    PRIMARY KEY (user_a, user_b),
    CONSTRAINT match_users_ordered CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_discovery_matches_user_a ON discovery_matches(user_a);
CREATE INDEX IF NOT EXISTS idx_discovery_matches_user_b ON discovery_matches(user_b);

-- 4. Discovery Prompts (System defined prompts)
CREATE TABLE IF NOT EXISTS discovery_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    question TEXT NOT NULL,
    field_key VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    options TEXT[] DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed some initial prompts
INSERT INTO discovery_prompts (category, question, field_key, type, options) VALUES
('Core', 'My campus vibe in one sentence...', 'vibe_sentence', 'text', NULL),
('Personality', 'My social battery is...', 'social_energy', 'select', ARRAY['Always on', 'Needs recharging', 'Low key', 'Party animal']),
('Campus Life', 'Favorite study spot?', 'study_spot', 'text', NULL),
('Campus Life', 'Go-to study break?', 'study_break', 'text', NULL),
('Taste', 'Unpopular opinion...', 'unpopular_opinion', 'text', NULL),
('Dating', 'Green flag in a standardized test partner?', 'green_flag', 'text', NULL)
ON CONFLICT DO NOTHING;
