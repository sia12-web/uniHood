-- Add ten_year_vision column to users table
-- This column stores the user's 10-year vision/goals for their profile

ALTER TABLE users ADD COLUMN IF NOT EXISTS ten_year_vision TEXT;
