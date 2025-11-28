-- Phase 2 moderation migration: introduce mod_appeal table for appeal workflow

CREATE TABLE IF NOT EXISTS mod_appeal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
  appellant_id UUID NOT NULL REFERENCES app_user(id),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 10 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by UUID NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL
);
