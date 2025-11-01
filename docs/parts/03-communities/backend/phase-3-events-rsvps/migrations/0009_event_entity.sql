-- Phase 3: event metadata
CREATE TABLE IF NOT EXISTS event_entity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
    campus_id UUID NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    description TEXT NOT NULL DEFAULT '',
    venue_id UUID NULL REFERENCES event_venue(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    capacity INT NULL CHECK (capacity IS NULL OR capacity >= 1),
    visibility TEXT NOT NULL CHECK (visibility IN ('public','private','secret')),
    rrule TEXT NULL,
    allow_guests BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_event_group_time ON event_entity(group_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_campus_time ON event_entity(campus_id, start_at) WHERE deleted_at IS NULL;
