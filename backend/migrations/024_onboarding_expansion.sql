-- 024_onboarding_expansion.sql
-- Add columns for extended profile details

ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sexual_orientation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS looking_for TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_prompts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifestyle JSONB DEFAULT '{}'::jsonb;
