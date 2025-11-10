-- Phase C: add payload_hash to idempotency and supporting index

BEGIN;

ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_idem_handler ON idempotency_keys (handler);

COMMIT;
