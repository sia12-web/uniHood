-- Phase C: composite index for invitations pagination

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_invitations_created_id'
  ) THEN
    CREATE INDEX idx_invitations_created_id ON invitations (created_at DESC, id);
  END IF;
END $$;

COMMIT;
