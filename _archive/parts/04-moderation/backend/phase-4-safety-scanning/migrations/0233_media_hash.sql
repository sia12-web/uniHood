CREATE TABLE IF NOT EXISTS mod_media_hash (
  id BIGSERIAL PRIMARY KEY,
  algo TEXT NOT NULL,
  hash TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (algo, hash)
);

CREATE INDEX IF NOT EXISTS idx_mod_media_hash_label
  ON mod_media_hash (label);
