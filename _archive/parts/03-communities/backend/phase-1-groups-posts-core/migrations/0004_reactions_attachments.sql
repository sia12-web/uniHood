CREATE TABLE reaction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment')),
  subject_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id, user_id, emoji)
);

CREATE INDEX idx_reaction_subject ON reaction(subject_type, subject_id);

CREATE TABLE media_attachment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment','group')),
  subject_id UUID NOT NULL,
  s3_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  width INT NULL,
  height INT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
