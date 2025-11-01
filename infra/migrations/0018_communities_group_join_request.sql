-- Phase 6: group join requests
CREATE TABLE IF NOT EXISTS group_join_request (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL,
    user_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_join_request_group_status
    ON group_join_request(group_id, status);
