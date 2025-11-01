-- Phase 5: linkage clusters for abuse correlation
CREATE TABLE IF NOT EXISTS mod_linkage (
    cluster_id UUID NOT NULL,
    user_id UUID NOT NULL,
    relation TEXT NOT NULL,
    strength SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cluster_id, user_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_mod_linkage_user ON mod_linkage(user_id);
CREATE INDEX IF NOT EXISTS idx_mod_linkage_relation ON mod_linkage(relation);
