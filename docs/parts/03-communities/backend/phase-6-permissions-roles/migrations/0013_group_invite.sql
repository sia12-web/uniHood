-- Migration: Create group_invite table
CREATE TABLE group_invite (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL,
  invited_user_id UUID NOT NULL,
  invited_by UUID NOT NULL,
  role VARCHAR(32) NOT NULL,
  expires_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);