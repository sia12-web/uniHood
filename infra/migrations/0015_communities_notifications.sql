-- Phase 5: realtime & notifications tables
CREATE TABLE IF NOT EXISTS notification_channel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('socket', 'email', 'push')),
    endpoint TEXT NULL,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_channel_user_kind
    ON notification_channel(user_id, kind);

CREATE TABLE IF NOT EXISTS notification_entity (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    ref_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    payload JSONB NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_delivered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_entity_user_created
    ON notification_entity(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_entity_user_unread
    ON notification_entity(user_id)
    WHERE is_read = FALSE;

CREATE TABLE IF NOT EXISTS unread_counter (
    user_id UUID PRIMARY KEY,
    count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
