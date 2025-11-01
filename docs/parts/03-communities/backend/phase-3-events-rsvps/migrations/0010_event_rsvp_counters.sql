-- Phase 3: aggregate counters per event
CREATE TABLE IF NOT EXISTS event_counter (
    event_id UUID PRIMARY KEY REFERENCES event_entity(id) ON DELETE CASCADE,
    going INT NOT NULL DEFAULT 0,
    waitlisted INT NOT NULL DEFAULT 0,
    interested INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
