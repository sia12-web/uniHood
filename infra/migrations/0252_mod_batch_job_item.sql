-- Phase 6: moderation batch job items

CREATE TABLE IF NOT EXISTS mod_batch_job_item (
    job_id UUID NOT NULL REFERENCES mod_batch_job(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    ok BOOLEAN,
    error TEXT NULL,
    result JSONB NULL,
    PRIMARY KEY (job_id, target_type, target_id)
);
