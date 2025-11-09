from __future__ import annotations

import os
import sys
import pathlib

import psycopg2

DSN = os.environ.get("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/divan")
MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "infra" / "migrations"


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/apply_single_migration.py <migration_filename.sql>")
        raise SystemExit(2)
    filename = sys.argv[1]
    path = MIGRATIONS_DIR / filename
    if not path.exists():
        print(f"Migration file not found: {path}")
        raise SystemExit(1)
    sql = path.read_text(encoding="utf-8")
    with psycopg2.connect(DSN) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
            print(f"Applied single migration: {filename}")


if __name__ == "__main__":
    main()
