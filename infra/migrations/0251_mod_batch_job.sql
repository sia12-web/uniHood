-- Phase 6: moderation batch job ledger

CREATE TABLE IF NOT EXISTS mod_batch_job (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type TEXT NOT NULL,
    initiated_by UUID NOT NULL REFERENCES app_user(id),
    params JSONB NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    sample_size INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    total INT NOT NULL DEFAULT 0,
    succeeded INT NOT NULL DEFAULT 0,
    failed INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL
);
