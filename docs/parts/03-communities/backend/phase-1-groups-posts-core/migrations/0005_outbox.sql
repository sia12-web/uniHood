-- Phase 1: Communities core — transactional outbox

CREATE TABLE IF NOT EXISTS outbox_event (
	id BIGSERIAL PRIMARY KEY,
	aggregate_type TEXT NOT NULL,
	aggregate_id UUID NOT NULL,
	event_type TEXT NOT NULL,
	payload JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	processed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
	ON outbox_event(processed_at)
	WHERE processed_at IS NULL;
