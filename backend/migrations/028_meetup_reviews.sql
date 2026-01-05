CREATE TABLE IF NOT EXISTS meetup_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL if reviewing the meetup itself
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetup_reviews_meetup_id ON meetup_reviews(meetup_id);
CREATE INDEX IF NOT EXISTS idx_meetup_reviews_reviewer_id ON meetup_reviews(reviewer_id);

-- Constraint to ensure one review per target per user per meetup
-- We use a conditional unique index or COALESCE trick.
-- COALESCE only works if the UUID matches type. '0000...' is a valid UUID literal usually?
-- Postgres UUID type can be cast from string.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetup_reviews_unique 
ON meetup_reviews (meetup_id, reviewer_id, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
