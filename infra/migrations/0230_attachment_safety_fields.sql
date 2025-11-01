-- Phase 4 safety metadata for media attachments. If the table is absent (community features not installed yet)
-- we skip the migration to keep apply_migrations idempotent across partial deployments.
DO $$
BEGIN
  ALTER TABLE media_attachment
    ADD COLUMN IF NOT EXISTS safety_status TEXT NOT NULL DEFAULT 'pending';
  ALTER TABLE media_attachment
    ADD COLUMN IF NOT EXISTS safety_score JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE media_attachment
    ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ NULL;

  CREATE INDEX IF NOT EXISTS idx_media_attachment_safety_status
    ON media_attachment (safety_status, created_at DESC);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'media_attachment table missing; skipping safety column backfill';
END $$;
