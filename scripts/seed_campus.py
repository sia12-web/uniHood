import os
import psycopg2

DSN = os.environ.get("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/divan")

SQL_CAMPUS = """
INSERT INTO campuses (id, name, lat, lon)
VALUES
	('33333333-3333-3333-3333-333333333333', 'Main Campus', 37.7749, -122.4194)
ON CONFLICT (id) DO NOTHING;
"""

def main():
    try:
        with psycopg2.connect(DSN) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                print("Seeding campus...")
                cur.execute(SQL_CAMPUS)
                print("Campus seeded.")
    except Exception as e:
        print(f"Error seeding campus: {e}")

if __name__ == "__main__":
    main()
