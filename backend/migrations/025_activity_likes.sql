-- 025_activity_likes.sql
-- Allow users to like activity feed items

CREATE TABLE IF NOT EXISTS activity_likes (
    audit_log_id BIGINT NOT NULL REFERENCES audit_log(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (audit_log_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_likes_audit_log_id ON activity_likes(audit_log_id);
CREATE INDEX IF NOT EXISTS idx_activity_likes_user_id ON activity_likes(user_id);
