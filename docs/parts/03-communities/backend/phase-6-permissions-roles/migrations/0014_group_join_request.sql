-- Migration: Create group_join_request table
CREATE TABLE group_join_request (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status VARCHAR(16) NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);