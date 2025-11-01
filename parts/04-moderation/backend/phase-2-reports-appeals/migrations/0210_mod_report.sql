-- Phase 2 moderation migration: extend mod_case and add mod_report table

ALTER TABLE mod_case
  ADD COLUMN IF NOT EXISTS escalation_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS appeal_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS appealed_by UUID NULL REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS appeal_note TEXT NULL;

CREATE TABLE IF NOT EXISTS mod_report (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, reporter_id)
);
