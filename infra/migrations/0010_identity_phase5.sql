-- Phase 5 — Interests, Skills, Social Links, Education, Public Profiles

BEGIN;

CREATE TABLE IF NOT EXISTS interests (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES interests(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_interests (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','friends','none')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, interest_id)
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display TEXT NOT NULL,
    proficiency INT NOT NULL DEFAULT 2 CHECK (proficiency BETWEEN 1 AND 5),
    visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','friends','none')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_skills_name ON user_skills(name);

CREATE TABLE IF NOT EXISTS social_links (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    url TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','friends','none')),
    PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS education (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    program TEXT NOT NULL DEFAULT '',
    year INT CHECK (year BETWEEN 1 AND 10),
    visibility TEXT NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','friends','none')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    handle TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_key TEXT,
    campus_id UUID,
    bio TEXT NOT NULL DEFAULT '',
    program TEXT NOT NULL DEFAULT '',
    year INT,
    interests TEXT[] NOT NULL DEFAULT '{}',
    skills JSONB NOT NULL DEFAULT '[]',
    links JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed baseline interest taxonomy for Phase 5 features
INSERT INTO interests (id, slug, name)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'technology', 'Technology'),
    ('20000000-0000-0000-0000-000000000002', 'arts', 'Arts & Culture'),
    ('20000000-0000-0000-0000-000000000003', 'sports', 'Sports & Wellness'),
    ('20000000-0000-0000-0000-000000000004', 'community', 'Community & Causes')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO interests (id, slug, name, parent_id)
VALUES
    ('20000000-0000-0000-0000-000000000101', 'web-dev', 'Web Development', '20000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000102', 'ai-ml', 'Artificial Intelligence', '20000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000103', 'mobile-apps', 'Mobile Apps', '20000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000201', 'visual-arts', 'Visual Arts', '20000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000202', 'music-performance', 'Music & Performance', '20000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000301', 'basketball', 'Basketball', '20000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000302', 'running', 'Running & Athletics', '20000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000401', 'volunteering', 'Volunteering', '20000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000402', 'sustainability', 'Sustainability', '20000000-0000-0000-0000-000000000004')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id;

COMMIT;
