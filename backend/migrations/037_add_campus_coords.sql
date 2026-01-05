-- Migration 037: Add coordinates to campuses
-- Purpose: Allow campus-based discovery to use specific center points

ALTER TABLE campuses ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
