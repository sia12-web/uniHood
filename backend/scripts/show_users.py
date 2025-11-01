import asyncpg
import asyncio
import json

DSN = "postgresql://postgres:postgres@localhost:5432/divan"
TARGET_HANDLES = ["sia123", "lilylily"]


async def main() -> None:
    conn = await asyncpg.connect(DSN)
    try:
        rows = await conn.fetch(
            "SELECT id, email, handle, campus_id FROM users WHERE handle = ANY($1)",
            TARGET_HANDLES,
        )
        print(json.dumps([dict(row) for row in rows], indent=2, default=str))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
