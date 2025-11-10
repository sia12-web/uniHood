-- Phase C: chat direct messages core tables & indexes

BEGIN;

CREATE TABLE IF NOT EXISTS chat_conversations (
  conversation_id TEXT PRIMARY KEY,
  user_a UUID NOT NULL,
  user_b UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  client_msg_id TEXT NOT NULL,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, seq),
  UNIQUE(conversation_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created_id
  ON chat_messages (conversation_id, created_at DESC, message_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_seq
  ON chat_messages (conversation_id, seq DESC);

COMMIT;
