-- Migration for notifications
CREATE TABLE notification_channel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('socket','email','push')),
  endpoint TEXT NULL,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_entity (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  ref_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_delivered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_created ON notification_entity(user_id, created_at DESC);
CREATE INDEX idx_notif_user_unread ON notification_entity(user_id) WHERE is_read=FALSE;

CREATE TABLE unread_counter (
  user_id UUID PRIMARY KEY,
  count INT NOT NULL DEFAULT 0
);
