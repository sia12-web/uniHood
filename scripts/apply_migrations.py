from __future__ import annotations

import os
import pathlib

import psycopg2

DSN = os.environ.get("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/divan")
MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "infra" / "migrations"


def main() -> None:
    paths = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not paths:
        raise SystemExit("no migration files found")
    with psycopg2.connect(DSN) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for path in paths:
                sql = path.read_text()
                try:
                    cur.execute(sql)
                    print(f"Applied {path.name}")
                except Exception as exc:  # noqa: BLE001
                    print(f"Failed applying {path.name}: {exc}")
                    raise


if __name__ == "__main__":
    main()
