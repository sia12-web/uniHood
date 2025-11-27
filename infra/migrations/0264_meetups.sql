CREATE TABLE IF NOT EXISTS meetups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_user_id UUID NOT NULL REFERENCES users(id),
    campus_id UUID NOT NULL REFERENCES campuses(id),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    duration_min INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING',
    room_id UUID REFERENCES rooms(id),
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetup_participants (
    meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'PARTICIPANT',
    status TEXT NOT NULL DEFAULT 'JOINED',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (meetup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meetups_campus_start ON meetups(campus_id, start_at);
CREATE INDEX IF NOT EXISTS idx_meetups_creator ON meetups(creator_user_id);
