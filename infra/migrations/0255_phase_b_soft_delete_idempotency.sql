-- Phase B: soft-delete columns and idempotency keys

BEGIN;

-- 1) Add deleted_at column to primary tables used by soft-delete semantics
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE rooms ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'room_messages' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE room_messages ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'invitations' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE invitations ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END$$;

-- 2) Recreate / normalize unique indexes so they exclude soft-deleted rows
-- users.email unique index (drop & recreate with deleted_at IS NULL predicate)
DROP INDEX IF EXISTS idx_users_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;

-- users.handle was created as a table-level UNIQUE constraint in early migrations
-- Drop default constraint-backed index (if present) and create partial unique index
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_handle_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_unique ON users(handle) WHERE deleted_at IS NULL;

-- invitations: ensure open invitation unique index ignores soft-deleted rows
DROP INDEX IF EXISTS idx_invitations_open_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_open_unique
    ON invitations (from_user_id, to_user_id)
    WHERE status = 'sent' AND deleted_at IS NULL;

-- 3) Create idempotency_keys table for once/complete helpers
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    handler TEXT NOT NULL,
    result_id UUID,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);

COMMIT;
