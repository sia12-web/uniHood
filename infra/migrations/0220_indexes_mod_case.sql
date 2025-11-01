-- Phase 3 moderation indexes for admin console filters
CREATE INDEX IF NOT EXISTS idx_mod_case_status ON mod_case(status);
CREATE INDEX IF NOT EXISTS idx_mod_case_assigned_open ON mod_case(assigned_to) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_mod_case_severity ON mod_case(severity);
CREATE INDEX IF NOT EXISTS idx_mod_case_created_at ON mod_case(created_at DESC);

-- Optional text search support for report reasons and notes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_mod_report_reason_trgm ON mod_report USING gin (reason_code gin_trgm_ops);
