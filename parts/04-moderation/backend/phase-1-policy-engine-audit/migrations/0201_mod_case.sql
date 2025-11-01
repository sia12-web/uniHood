CREATE TABLE IF NOT EXISTS mod_case (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment','user','group','event','message')),
    subject_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open','actioned','dismissed','escalated')),
    reason TEXT NOT NULL,
    policy_id UUID NULL REFERENCES mod_policy(id),
    severity SMALLINT NOT NULL DEFAULT 0,
    created_by UUID NULL,
    assigned_to UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(subject_type, subject_id)
);
