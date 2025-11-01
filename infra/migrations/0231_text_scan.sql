CREATE TABLE IF NOT EXISTS mod_text_scan (
  id BIGSERIAL PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  lang TEXT NULL,
  scores JSONB NOT NULL,
  ocr BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_mod_text_scan_subject
  ON mod_text_scan (subject_type, subject_id);
