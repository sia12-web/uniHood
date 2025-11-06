DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profile_gallery'
	) THEN
		ALTER TABLE users ADD COLUMN profile_gallery JSONB;
		UPDATE users SET profile_gallery = '[]'::jsonb WHERE profile_gallery IS NULL;
		ALTER TABLE users ALTER COLUMN profile_gallery SET DEFAULT '[]'::jsonb;
		ALTER TABLE users ALTER COLUMN profile_gallery SET NOT NULL;
	END IF;
END$$;
