CREATE TABLE IF NOT EXISTS discovery_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'core_identity', 'personality', etc.
    question TEXT NOT NULL,
    field_key TEXT NOT NULL, -- e.g. 'vibe_sentence', maps to JSON key
    type TEXT NOT NULL DEFAULT 'text', -- 'text', 'select', etc.
    options TEXT[], -- for select types
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial prompts
INSERT INTO discovery_prompts (category, question, field_key) VALUES
('core_identity', 'Describe your campus vibe in one sentence.', 'vibe_sentence'),
('core_identity', 'Where do you spend most of your time on campus?', 'campus_location'),
('personality', 'What’s your social energy on a weekday?', 'social_energy'),
('personality', 'What’s your ideal study break?', 'study_break'),
('personality', 'What’s one tiny thing that makes your day better?', 'tiny_joy'),
('campus_life', 'Residence hall or neighborhood', 'residence'),
('campus_life', 'Clubs / communities', 'clubs'),
('campus_life', 'What class changed how you think?', 'meaningful_class'),
('dating_adjacent', 'What’s your ideal first hangout?', 'first_hangout'),
('dating_adjacent', 'What’s a green flag for you?', 'green_flag'),
('dating_adjacent', 'What’s your flirting style?', 'flirting_style'),
('taste', 'Song you’re looping right now', 'song'),
('taste', 'Your campus fashion vibe', 'fashion_vibe'),
('taste', 'Your dream weekend plan', 'weekend_plan'),
('playful', 'Hot take that won’t get you cancelled', 'hot_take'),
('playful', 'Your toxic academic trait', 'toxic_trait'),
('playful', 'Your NPC moment this week', 'npc_moment'),
('playful', 'Your delulu thought of the week', 'delulu_thought');

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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_tags ON user_discovery_profiles USING gin(auto_tags);
