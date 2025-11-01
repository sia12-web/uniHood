CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campuses' AND column_name = 'domain') THEN
		ALTER TABLE campuses ADD COLUMN domain TEXT;
	END IF;
END$$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_indexes
		WHERE schemaname = 'public' AND indexname = 'idx_campuses_domain_unique'
	) THEN
		CREATE UNIQUE INDEX idx_campuses_domain_unique ON campuses (domain) WHERE domain IS NOT NULL;
	END IF;
END$$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email') THEN
		ALTER TABLE users ADD COLUMN email TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_verified') THEN
		ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'bio') THEN
		ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_key') THEN
		ALTER TABLE users ADD COLUMN avatar_key TEXT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'status') THEN
		ALTER TABLE users ADD COLUMN status JSONB NOT NULL DEFAULT jsonb_build_object('text', '', 'emoji', '', 'updated_at', NOW());
	END IF;
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash') THEN
		ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT 'argon2id$pending';
	END IF;
END$$;

ALTER TABLE users
	ALTER COLUMN display_name SET DEFAULT '';

ALTER TABLE users
	ALTER COLUMN privacy SET DEFAULT jsonb_build_object('visibility', 'everyone', 'ghost_mode', FALSE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);
CREATE INDEX IF NOT EXISTS idx_users_handle_trgm ON users USING gin (handle gin_trgm_ops);

CREATE TABLE IF NOT EXISTS email_verifications (
	id UUID PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token TEXT NOT NULL UNIQUE,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verif_user_open ON email_verifications(user_id) WHERE used_at IS NULL;
