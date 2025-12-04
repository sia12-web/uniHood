-- Update activities kind check constraint to allow 'story_builder'
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check;

UPDATE activities SET kind = 'story_builder' WHERE kind = 'story_alt';

ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (kind IN ('typing_duel','story_builder','trivia','rps'));
