from __future__ import annotations

import os
import pathlib

import time
import psycopg2

DSN = os.environ.get("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/divan")
MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "infra" / "migrations"


def wait_for_db(retries: int = 30, delay: int = 2) -> psycopg2.extensions.connection:
    for i in range(retries):
        try:
            return psycopg2.connect(DSN)
        except psycopg2.OperationalError as e:
            if "starting up" in str(e) or "Connection refused" in str(e):
                print(f"Database starting up... waiting {delay}s ({i+1}/{retries})")
                time.sleep(delay)
            else:
                raise
    raise SystemExit("Could not connect to database after multiple retries")


def main() -> None:
    paths = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not paths:
        raise SystemExit("no migration files found")
    
    with wait_for_db() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            for path in paths:
                sql = path.read_text()
                try:
                    cur.execute(sql)
                    version = path.name.split("_", 1)[0]
                    cur.execute(
                        """
                        INSERT INTO schema_migrations (version)
                        VALUES (%s)
                        ON CONFLICT (version) DO UPDATE SET applied_at = NOW()
                        """,
                        (version,),
                    )
                    print(f"Applied {path.name}")
                except Exception as exc:  # noqa: BLE001
                    print(f"Failed applying {path.name}: {exc}")
                    raise


if __name__ == "__main__":
    main()
