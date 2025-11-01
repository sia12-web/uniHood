-- Phase 4: Rooms & Group Chat schema additions

BEGIN;

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY,
    campus_id UUID NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    preset TEXT NOT NULL CHECK (preset IN ('2-4','4-6','12+')),
    visibility TEXT NOT NULL CHECK (visibility IN ('private','link')),
    join_code TEXT UNIQUE,
    capacity INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_join_code ON rooms(join_code) WHERE join_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS room_members (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner','moderator','member')),
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

CREATE TABLE IF NOT EXISTS room_messages (
    id TEXT PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_msg_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('text','image','file')),
    content TEXT,
    media_key TEXT,
    media_mime TEXT,
    media_bytes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, seq),
    UNIQUE (room_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_seq ON room_messages(room_id, seq DESC);

CREATE TABLE IF NOT EXISTS room_receipts (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_seq BIGINT NOT NULL DEFAULT 0,
    read_seq BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

-- updated_at trigger reuse
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_touch_updated ON rooms;
CREATE TRIGGER trg_rooms_touch_updated
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_room_receipts_touch_updated ON room_receipts;
CREATE TRIGGER trg_room_receipts_touch_updated
    BEFORE UPDATE ON room_receipts
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();

COMMIT;
