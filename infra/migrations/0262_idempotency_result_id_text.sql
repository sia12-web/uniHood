-- Normalize idempotency_keys.result_id to TEXT to support ULIDs/strings across handlers

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='idempotency_keys' AND column_name='result_id' AND data_type IN ('uuid')
    ) THEN
        ALTER TABLE idempotency_keys
            ALTER COLUMN result_id TYPE TEXT USING result_id::text;
    END IF;
END$$;

COMMIT;