-- Phase 3 moderation indexes for audit viewer
CREATE INDEX IF NOT EXISTS idx_mod_audit_target_id ON mod_audit(target_id);
CREATE INDEX IF NOT EXISTS idx_mod_audit_actor ON mod_audit(actor_id);
