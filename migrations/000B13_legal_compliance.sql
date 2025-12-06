-- Migration: Legal compliance tables for holds and request logging
-- O2-01: Data Retention & Legal Request Policy

-- Legal holds table for preservation requests from law enforcement
CREATE TABLE IF NOT EXISTS legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL UNIQUE,
    user_ids UUID[] NOT NULL,
    authority VARCHAR(255) NOT NULL,
    reason TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ,
    released_by VARCHAR(255),
    notes TEXT
);

-- Index for checking if a user is under legal hold
CREATE INDEX IF NOT EXISTS idx_legal_holds_user_ids ON legal_holds USING GIN (user_ids);
CREATE INDEX IF NOT EXISTS idx_legal_holds_expires ON legal_holds (expires_at) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds (created_at) WHERE released_at IS NULL;

-- Legal request log for compliance auditing
CREATE TABLE IF NOT EXISTS legal_request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('subpoena', 'court_order', 'warrant', 'preservation', 'user_access', 'user_deletion', 'user_correction')),
    authority VARCHAR(255) NOT NULL,
    reference_number VARCHAR(100),
    received_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    user_ids UUID[],
    data_types TEXT[],
    data_produced JSONB,
    notes TEXT,
    handled_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_requests_date ON legal_request_log (received_at);
CREATE INDEX IF NOT EXISTS idx_legal_requests_type ON legal_request_log (request_type);
CREATE INDEX IF NOT EXISTS idx_legal_requests_ref ON legal_request_log (reference_number) WHERE reference_number IS NOT NULL;

-- Data retention audit log for tracking purge operations
CREATE TABLE IF NOT EXISTS retention_audit_log (
    id BIGSERIAL PRIMARY KEY,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    table_name VARCHAR(100) NOT NULL,
    records_purged INT NOT NULL DEFAULT 0,
    retention_days INT NOT NULL,
    skipped_holds INT NOT NULL DEFAULT 0,
    duration_ms INT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_retention_audit_date ON retention_audit_log (run_at);

-- Add legal_hold flag to users metadata for quick checks
-- (This is an optimization; the source of truth is legal_holds table)
COMMENT ON TABLE legal_holds IS 'Preservation holds for legal/law enforcement requests. Check before any data deletion.';
COMMENT ON TABLE legal_request_log IS 'Audit log of all legal data requests for compliance reporting.';
COMMENT ON TABLE retention_audit_log IS 'Tracks automated data retention purge operations.';
