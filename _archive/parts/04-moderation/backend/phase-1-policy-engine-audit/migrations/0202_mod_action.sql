CREATE TABLE IF NOT EXISTS mod_action (
    id BIGSERIAL PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('none','tombstone','remove','shadow_hide','mute','ban','warn','restrict_create','restrict_invites')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
