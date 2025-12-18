-- Add ten_year_vision column to users table
-- This column stores the user's 10-year vision/goals for their profile

ALTER TABLE users ADD COLUMN IF NOT EXISTS ten_year_vision TEXT;

-- Optional: Add an index if you plan to search by this column
-- CREATE INDEX IF NOT EXISTS idx_users_ten_year_vision ON users USING gin (to_tsvector('english', ten_year_vision)) WHERE ten_year_vision IS NOT NULL;
