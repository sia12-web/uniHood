"""Quick helper to toggle emailVerified for a given user."""

from __future__ import annotations

import argparse
import asyncio

import asyncpg

DSN = "postgresql://postgres:postgres@localhost:5432/divan"


async def verify(email: str) -> None:
    conn = await asyncpg.connect(DSN)
    try:
        row = await conn.fetchrow("SELECT id, email_verified FROM users WHERE email = $1", email)
        if not row:
            emails = await conn.fetch("SELECT email FROM users ORDER BY email ASC")
            sample = ", ".join(str(item["email"]) for item in emails[:10])
            raise SystemExit(f"No user found for {email!r}. Known emails: {sample}")
        if row["email_verified"]:
            print(f"{email} already verified (user_id={row['id']})")
            return
        await conn.execute(
            "UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE email = $1",
            email,
        )
        print(f"Marked {email} as verified (user_id={row['id']})")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Force-verify a user email")
    parser.add_argument("email", help="Email address to verify")
    args = parser.parse_args()
    asyncio.run(verify(args.email))


if __name__ == "__main__":
    main()
