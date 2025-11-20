-- Chat sequencing & delivery tracking tables (missing previously)
-- Adds chat_seq (per-conversation monotonic sequence) and chat_delivery (per-user delivered watermark)
-- Safe to run multiple times due to IF NOT EXISTS guards.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_seq (
  conversation_id TEXT PRIMARY KEY,
  last_seq BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_delivery (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  delivered_seq BIGINT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- Helpful index for fetching pending deliveries (messages after delivered watermark)
CREATE INDEX IF NOT EXISTS idx_chat_delivery_conv_user_seq
  ON chat_delivery (conversation_id, user_id, delivered_seq);

COMMIT;