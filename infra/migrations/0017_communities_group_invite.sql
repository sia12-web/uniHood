-- Phase 6: group invites
CREATE TABLE IF NOT EXISTS group_invite (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL,
    invited_user_id UUID NOT NULL,
    invited_by UUID NOT NULL,
    role VARCHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_invite_unique_target
    ON group_invite(group_id, invited_user_id)
    WHERE accepted_at IS NULL;
