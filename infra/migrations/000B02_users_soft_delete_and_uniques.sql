-- Phase B: soft delete additions and case-insensitive uniques for users
BEGIN;

-- Ensure soft-delete column exists on key tables
ALTER TABLE users       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE rooms       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE messages    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Drop legacy indexes if they exist before recreating partial variants
DROP INDEX IF EXISTS idx_users_email_unique;
DROP INDEX IF EXISTS idx_users_handle_unique;
DROP INDEX IF EXISTS users_handle_key;
DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS invitations_from_user_id_to_user_id_key;
DROP INDEX IF EXISTS idx_invitations_open_unique;

-- Drop any unique constraints on users.handle/email regardless of name
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conkey
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND conkey IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM unnest(c.conkey) AS a(attnum)
      JOIN pg_attribute pa ON pa.attrelid = 'users'::regclass AND pa.attnum = a.attnum
      WHERE pa.attname IN ('handle', 'email')
    ) THEN
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', c.conname);
    END IF;
  END LOOP;
END $$;

-- Recreate partial uniques (exclude soft-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_active
  ON users ((lower(email)::citext))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique_active
  ON users ((lower(handle)::citext))
  WHERE deleted_at IS NULL;

-- Invitations should also ignore soft-deleted rows when enforcing unique open requests
CREATE UNIQUE INDEX IF NOT EXISTS invitations_open_unique_active
  ON invitations (from_user_id, to_user_id)
  WHERE status = 'sent' AND deleted_at IS NULL;

COMMIT;
