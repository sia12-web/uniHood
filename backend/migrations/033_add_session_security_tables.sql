-- 033_add_session_security_tables.sql
-- Missing tables for Risk Engine and Device Binding

-- 1. Session Fingerprinting
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

-- 2. Session Risk
CREATE TABLE IF NOT EXISTS session_risk (
    session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL,
    reasons TEXT[] DEFAULT '{}',
    step_up_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trust Profiles
CREATE TABLE IF NOT EXISTS trust_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    trust_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_profiles_level ON trust_profiles(trust_level);
