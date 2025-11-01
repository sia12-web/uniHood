-- Phase 8 identity tables for account linking, contact discovery, and risk

-- linked OAuth identities
CREATE TABLE IF NOT EXISTS oauth_identities (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('google','microsoft','apple')),
    subject text NOT NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id);

-- staged email changes
CREATE TABLE IF NOT EXISTS email_change_requests (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email text NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_change_user ON email_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_token ON email_change_requests(token);

-- phone numbers
CREATE TABLE IF NOT EXISTS user_phones (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    e164 text NOT NULL UNIQUE,
    verified boolean NOT NULL DEFAULT FALSE,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT NOW()
);

-- risk scoring metadata
CREATE TABLE IF NOT EXISTS session_risk (
    session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    risk_score int NOT NULL,
    reasons text[] NOT NULL DEFAULT '{}',
    step_up_required boolean NOT NULL DEFAULT FALSE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- contact discovery hash directory
CREATE TABLE IF NOT EXISTS contact_hashes (
    hash text PRIMARY KEY,
    ref_kind text NOT NULL CHECK (ref_kind IN ('email','phone')),
    created_at timestamptz NOT NULL DEFAULT NOW()
);

-- user opt-in state for contact discovery
CREATE TABLE IF NOT EXISTS contact_optin (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT FALSE,
    updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_optin_enabled ON contact_optin(enabled);
