BEGIN;

-- Add logo_url column to campuses table to store university logos
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Optional: Add an index if we expect to filter/search by logo presence
-- CREATE INDEX IF NOT EXISTS idx_campuses_logo ON campuses(logo_url) WHERE logo_url IS NOT NULL;

COMMIT;
