-- Migration: Add moderation fields to group_member
ALTER TABLE group_member ADD COLUMN muted_until TIMESTAMP;
ALTER TABLE group_member ADD COLUMN is_banned BOOLEAN DEFAULT FALSE;