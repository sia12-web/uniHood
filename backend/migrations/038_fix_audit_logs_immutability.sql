-- Migration 038: Fix audit_logs immutability for user deletion
-- Purpose: Allow ON DELETE SET NULL action on audit_logs when a user is deleted.

CREATE OR REPLACE FUNCTION prevent_audit_log_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updating user_id to NULL (triggered by ON DELETE SET NULL)
    IF (TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL) THEN
        -- Verify no other security-critical columns were changed
        IF (NEW.id IS NOT DISTINCT FROM OLD.id AND
            NEW.event IS NOT DISTINCT FROM OLD.event AND
            NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address AND
            NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent AND
            NEW.meta IS NOT DISTINCT FROM OLD.meta AND
            NEW.created_at IS NOT DISTINCT FROM OLD.created_at) THEN
            RETURN NEW;
        END IF;
    END IF;
    
    RAISE EXCEPTION 'audit_logs table is immutable';
END;
$$ LANGUAGE plpgsql;
