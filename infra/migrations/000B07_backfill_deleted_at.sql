-- Phase B: idempotent backfill helper for deleted_at columns
BEGIN;

-- Ensure deleted_at exists (no-op if already present)
ALTER TABLE users       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE rooms       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE messages    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Optional: normalise NULLs (no-op)
UPDATE users       SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND FALSE;
UPDATE rooms       SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND FALSE;
UPDATE messages    SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND FALSE;
UPDATE invitations SET deleted_at = NULL WHERE deleted_at IS NOT NULL AND FALSE;

COMMIT;
