-- Phase 6: moderation fields on group_member
ALTER TABLE group_member ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
ALTER TABLE group_member ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_group_member_banned
    ON group_member(group_id)
    WHERE is_banned = TRUE;
