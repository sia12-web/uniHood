-- 001_initial_schema.sql
-- Restore missing core tables that caused login 500 errors

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS campuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    domain TEXT,
    logo_url TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    handle TEXT UNIQUE NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_key TEXT,
    avatar_url TEXT,
    campus_id UUID REFERENCES campuses(id),
    privacy JSONB DEFAULT '{}',
    status JSONB DEFAULT '{}',
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    major TEXT,
    graduation_year INTEGER,
    passions JSONB DEFAULT '[]',
    profile_gallery JSONB DEFAULT '[]',
    social_links JSONB DEFAULT '{}',
    lat FLOAT,
    lon FLOAT,
    ten_year_vision TEXT,
    roles JSONB DEFAULT '[]', 
    is_university_verified BOOLEAN DEFAULT FALSE,
    gender TEXT,
    birthday DATE,
    hometown TEXT,
    relationship_status TEXT,
    sexual_orientation TEXT,
    looking_for JSONB DEFAULT '[]',
    height INTEGER,
    languages JSONB DEFAULT '[]',
    profile_prompts JSONB DEFAULT '[]',
    lifestyle JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id),
    permission_id UUID REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),
    campus_id UUID REFERENCES campuses(id),
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to support ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_uk ON user_roles(user_id, role_id, campus_id);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    ip TEXT,
    user_agent TEXT,
    device_label TEXT,
    revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS trusted_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    platform TEXT,
    browser TEXT,
    user_agent TEXT,
    last_ip TEXT,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    label TEXT,
    revoked BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

-- Default data
INSERT INTO roles (name, description) VALUES ('admin', 'Administrator'), ('user', 'Standard User') ON CONFLICT (name) DO NOTHING;
