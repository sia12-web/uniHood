CREATE TABLE IF NOT EXISTS mod_url_scan (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  eTLD_plus_one TEXT NULL,
  final_url TEXT NULL,
  verdict TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mod_url_scan_final
  ON mod_url_scan (final_url);

CREATE INDEX IF NOT EXISTS idx_mod_url_scan_etld
  ON mod_url_scan (eTLD_plus_one);
