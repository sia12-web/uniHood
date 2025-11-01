-- Phase 7 — Passkeys (WebAuthn) and Trusted Device storage

BEGIN;

CREATE TABLE IF NOT EXISTS authenticators (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cred_id BYTEA NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    aaguid UUID,
    transports TEXT[] NOT NULL DEFAULT '{}',
    counter INT NOT NULL DEFAULT 0,
    attestation_fmt TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_authenticators_user ON authenticators(user_id);
CREATE INDEX IF NOT EXISTS idx_authenticators_last_used ON authenticators(user_id, last_used_at DESC NULLS LAST);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_name = 'authenticators_label_length'
    ) THEN
        ALTER TABLE authenticators
            ADD CONSTRAINT authenticators_label_length CHECK (char_length(label) <= 40);
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS trusted_devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'unknown',
    browser TEXT NOT NULL DEFAULT 'unknown',
    user_agent TEXT NOT NULL DEFAULT '',
    last_ip TEXT,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    label TEXT NOT NULL DEFAULT '',
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_last_seen ON trusted_devices(user_id, last_seen DESC NULLS LAST);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.check_constraints
        WHERE constraint_name = 'trusted_devices_label_length'
    ) THEN
        ALTER TABLE trusted_devices
            ADD CONSTRAINT trusted_devices_label_length CHECK (char_length(label) <= 40);
    END IF;
END;
$$;

COMMIT;
