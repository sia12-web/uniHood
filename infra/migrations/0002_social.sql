-- Phase 2: Invites & Friendships schema additions

BEGIN;

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY,
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    campus_id UUID NULL,
    status TEXT NOT NULL CHECK (status IN ('sent','accepted','declined','cancelled','expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
    user_id UUID NOT NULL,
    friend_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted','blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, friend_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_open_unique
    ON invitations (from_user_id, to_user_id)
    WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_invitations_to_user
    ON invitations (to_user_id)
    WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_friendships_user_status
    ON friendships (user_id, status);

-- updated_at triggers (generic)
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitations_touch_updated ON invitations;
CREATE TRIGGER trg_invitations_touch_updated
    BEFORE UPDATE ON invitations
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_friendships_touch_updated ON friendships;
CREATE TRIGGER trg_friendships_touch_updated
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();

COMMIT;
