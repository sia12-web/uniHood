import psycopg2

DSN = "postgresql://postgres:postgres@localhost:5432/divan"
SQL = """
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'major'
	) THEN
		ALTER TABLE users ADD COLUMN major TEXT;
	END IF;
END$$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'graduation_year'
	) THEN
		ALTER TABLE users ADD COLUMN graduation_year INTEGER;
	END IF;
END$$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'passions'
	) THEN
		ALTER TABLE users ADD COLUMN passions JSONB;
		UPDATE users SET passions = '[]'::jsonb WHERE passions IS NULL;
		ALTER TABLE users ALTER COLUMN passions SET DEFAULT '[]'::jsonb;
		ALTER TABLE users ALTER COLUMN passions SET NOT NULL;
	END IF;
END$$;
"""

def main() -> None:
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(SQL)
    print("Applied profile details columns (major, graduation_year, passions)")

if __name__ == "__main__":
    main()
