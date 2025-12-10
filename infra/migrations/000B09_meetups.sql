-- Meetups feature
-- Tables for scheduling and joining meetups

CREATE TABLE IF NOT EXISTS meetups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID NOT NULL,
    campus_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('study', 'social', 'game', 'food', 'other')),
    start_at TIMESTAMPTZ NOT NULL,
    duration_min INT NOT NULL DEFAULT 60,
    status TEXT NOT NULL CHECK (status IN ('UPCOMING', 'ACTIVE', 'ENDED', 'CANCELLED')) DEFAULT 'UPCOMING',
    room_id UUID, -- Link to the chat room
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetups_campus_status ON meetups (campus_id, status);
CREATE INDEX IF NOT EXISTS idx_meetups_creator ON meetups (creator_user_id);
CREATE INDEX IF NOT EXISTS idx_meetups_start_at ON meetups (start_at);

CREATE TABLE IF NOT EXISTS meetup_participants (
    meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('HOST', 'PARTICIPANT')),
    status TEXT NOT NULL CHECK (status IN ('JOINED', 'LEFT')) DEFAULT 'JOINED',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (meetup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meetup_participants_user ON meetup_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_meetup_participants_meetup_status ON meetup_participants (meetup_id, status);
