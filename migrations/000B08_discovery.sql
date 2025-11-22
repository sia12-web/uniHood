-- Discovery swipe interactions and matches
-- Creates tables to persist likes/passes and mutual matches for the discovery feed.

-- Interactions: latest action per (user, target)
CREATE TABLE IF NOT EXISTS discovery_interactions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL,
	target_id UUID NOT NULL,
	action TEXT NOT NULL CHECK (action IN ('like','pass')),
	cursor_token TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_interactions_user ON discovery_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_interactions_target ON discovery_interactions (target_id);

-- Matches: mutual likes recorded once per pair, ordered to avoid duplicates
CREATE TABLE IF NOT EXISTS discovery_matches (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_a UUID NOT NULL,
	user_b UUID NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_a, user_b),
	CHECK (user_a <> user_b)
);

-- Ensure deterministic ordering by always storing the smaller UUID in user_a
CREATE OR REPLACE FUNCTION discovery_match_normalize() RETURNS trigger AS $$
DECLARE
	tmp UUID;
BEGIN
	IF NEW.user_a > NEW.user_b THEN
		tmp := NEW.user_a;
		NEW.user_a := NEW.user_b;
		NEW.user_b := tmp;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_discovery_match_normalize ON discovery_matches;
CREATE TRIGGER trg_discovery_match_normalize
	BEFORE INSERT ON discovery_matches
	FOR EACH ROW EXECUTE FUNCTION discovery_match_normalize();

CREATE INDEX IF NOT EXISTS idx_discovery_matches_user_a ON discovery_matches (user_a);
CREATE INDEX IF NOT EXISTS idx_discovery_matches_user_b ON discovery_matches (user_b);
