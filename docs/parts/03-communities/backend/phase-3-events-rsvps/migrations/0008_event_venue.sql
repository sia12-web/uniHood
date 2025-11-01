-- Phase 3: event venue storage
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS event_venue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campus_id UUID NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('physical','virtual')),
    address TEXT NULL,
    lat DOUBLE PRECISION NULL,
    lon DOUBLE PRECISION NULL,
    url TEXT NULL,
    tz TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_venue_campus ON event_venue(campus_id);
