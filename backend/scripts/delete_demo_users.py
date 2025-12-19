"""Delete demo / test users in bulk.

This script is intentionally conservative:
- It requires at least one filter (handle/email/id/time) to select users.
- It defaults to a dry-run (prints what it *would* delete).
- It uses the existing account deletion workflow (hard delete + dependent rows).

Typical usage:
  # Dry-run: find users whose handle starts with "demo_"
  python -m backend.scripts.delete_demo_users --handle-prefix demo_

  # Execute: actually delete them
  python -m backend.scripts.delete_demo_users --handle-prefix demo_ --execute

If you are targeting production, make sure your environment variables point at the
correct database (POSTGRES_URL / DATABASE_URL) before running.
"""

from __future__ import annotations

import argparse
import asyncio
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from app.domain.identity import deletion
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client


@dataclass(frozen=True)
class Candidate:
	id: str
	handle: str
	campus_id: str
	email: Optional[str]
	created_at: Optional[datetime]
	deleted_at: Optional[datetime]


def _parse_dt(value: str) -> datetime:
	# Accept ISO-8601-ish timestamps (YYYY-MM-DD or full datetime).
	try:
		return datetime.fromisoformat(value)
	except Exception as exc:
		raise argparse.ArgumentTypeError(f"Invalid datetime: {value}") from exc


def _parse_args() -> argparse.Namespace:
	p = argparse.ArgumentParser(description="Delete demo/test users (bulk)")
	p.add_argument("--handle-prefix", default=None, help="Delete users whose handle starts with this prefix")
	p.add_argument("--handle-regex", default=None, help="Delete users whose handle matches this regex")
	# NOTE: argparse help text uses %-formatting internally; escape % as %%.
	p.add_argument(
		"--email-like",
		default=None,
		help="Delete users whose email ILIKE this pattern (e.g. '%%@example.com')",
	)
	p.add_argument(
		"--email-null",
		action="store_true",
		help="Include users with NULL email (often dev/bootstrap users)",
	)
	p.add_argument(
		"--user-id",
		action="append",
		default=[],
		help="Delete a specific user id (repeatable)",
	)
	p.add_argument("--created-after", type=_parse_dt, default=None)
	p.add_argument("--created-before", type=_parse_dt, default=None)
	p.add_argument(
		"--include-soft-deleted",
		action="store_true",
		help="Include users that already have deleted_at set",
	)
	p.add_argument(
		"--limit",
		type=int,
		default=500,
		help="Safety limit for max candidates (default: 500)",
	)
	p.add_argument(
		"--execute",
		action="store_true",
		help="Actually delete. Without this flag, runs in dry-run mode.",
	)
	return p.parse_args()


def _ensure_filters(args: argparse.Namespace) -> None:
	if (
		not args.handle_prefix
		and not args.handle_regex
		and not args.email_like
		and not args.email_null
		and not args.user_id
		and not args.created_after
		and not args.created_before
	):
		raise SystemExit(
			"Refusing to run without any filters. Provide at least one of: "
			"--handle-prefix/--handle-regex/--email-like/--email-null/--user-id/--created-after/--created-before"
		)


async def _detect_columns(conn) -> set[str]:
	rows = await conn.fetch(
		"""
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users'
		"""
	)
	return {str(r["column_name"]) for r in rows}


def _build_where(args: argparse.Namespace, cols: set[str]) -> tuple[str, list[object]]:
	clauses: list[str] = []
	params: list[object] = []

	def add(clause: str, *values: object) -> None:
		clauses.append(clause)
		params.extend(values)

	if not args.include_soft_deleted and "deleted_at" in cols:
		clauses.append("deleted_at IS NULL")

	if args.user_id:
		# asyncpg uses $1, $2... placeholders
		placeholders = []
		for uid in args.user_id:
			params.append(uid)
			placeholders.append(f"${len(params)}")
		clauses.append(f"id IN ({', '.join(placeholders)})")

	if args.handle_prefix:
		params.append(args.handle_prefix + "%")
		clauses.append(f"handle ILIKE ${len(params)}")

	if args.handle_regex:
		# Postgres regex is ~. Use case-insensitive by embedding (?i) in the pattern.
		# We also validate the regex compiles in Python to catch typos early.
		try:
			re.compile(args.handle_regex)
		except re.error as exc:
			raise SystemExit(f"Invalid --handle-regex: {exc}") from exc
		params.append(args.handle_regex)
		clauses.append(f"handle ~ ${len(params)}")

	if args.email_like:
		if "email" not in cols:
			raise SystemExit("users.email column not found; cannot use --email-like")
		params.append(args.email_like)
		clauses.append(f"email ILIKE ${len(params)}")

	if args.email_null:
		if "email" not in cols:
			raise SystemExit("users.email column not found; cannot use --email-null")
		clauses.append("email IS NULL")

	if args.created_after:
		if "created_at" not in cols:
			raise SystemExit("users.created_at column not found; cannot use --created-after")
		params.append(args.created_after)
		clauses.append(f"created_at >= ${len(params)}")

	if args.created_before:
		if "created_at" not in cols:
			raise SystemExit("users.created_at column not found; cannot use --created-before")
		params.append(args.created_before)
		clauses.append(f"created_at <= ${len(params)}")

	where_sql = " AND ".join(clauses) if clauses else "TRUE"
	return where_sql, params


async def _list_candidates(args: argparse.Namespace) -> list[Candidate]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		cols = await _detect_columns(conn)
		for required in ("id", "handle", "campus_id"):
			if required not in cols:
				raise SystemExit(f"users.{required} column not found; cannot safely delete")

		where_sql, params = _build_where(args, cols)
		select_cols = ["id", "handle", "campus_id"]
		if "email" in cols:
			select_cols.append("email")
		if "created_at" in cols:
			select_cols.append("created_at")
		if "deleted_at" in cols:
			select_cols.append("deleted_at")

		query = (
			f"SELECT {', '.join(select_cols)} FROM users WHERE {where_sql} ORDER BY created_at DESC NULLS LAST LIMIT {int(args.limit)}"
		)
		rows = await conn.fetch(query, *params)

	candidates: list[Candidate] = []
	for row in rows:
		candidates.append(
			Candidate(
				id=str(row["id"]),
				handle=str(row["handle"]),
				campus_id=str(row["campus_id"]),
				email=str(row.get("email")) if row.get("email") is not None else None,
				created_at=row.get("created_at"),
				deleted_at=row.get("deleted_at"),
			)
		)
	return candidates


async def _purge_presence(user_id: str) -> None:
	# Best-effort cleanup of transient redis keys.
	try:
		await redis_client.delete(
			f"presence:{user_id}",
			f"profile:{user_id}",
			f"online:user:{user_id}",
		)
		# geo set member removal (Redis GEO is backed by a ZSET)
		try:
			await redis_client.zrem("geo:presence:global", user_id)
		except Exception:
			pass
	except Exception:
		pass


async def delete_demo_users() -> None:
	args = _parse_args()
	_ensure_filters(args)

	candidates = await _list_candidates(args)
	if not candidates:
		print("No matching users found.")
		return

	print(f"Matched {len(candidates)} users (limit={args.limit}).")
	for c in candidates[:25]:
		email = c.email or "(no email)"
		created = c.created_at.isoformat() if c.created_at else "(no created_at)"
		del_at = c.deleted_at.isoformat() if c.deleted_at else "(active)"
		print(f"- {c.id}  handle={c.handle}  email={email}  created_at={created}  deleted_at={del_at}")
	if len(candidates) > 25:
		print(f"... and {len(candidates) - 25} more")

	if not args.execute:
		print("\nDry-run only. Re-run with --execute to delete.")
		return

	phrase = f"DELETE {len(candidates)} USERS"
	confirm = input(f"\nType '{phrase}' to confirm: ").strip()
	if confirm != phrase:
		print("Aborted.")
		return

	deleted = 0
	for c in candidates:
		user = AuthenticatedUser(id=c.id, campus_id=c.campus_id)
		await deletion.force_delete(user)
		await _purge_presence(c.id)
		deleted += 1
		if deleted % 25 == 0:
			print(f"Deleted {deleted}/{len(candidates)}...")

	print(f"Done. Deleted {deleted} users.")


def main() -> None:
	asyncio.run(delete_demo_users())


if __name__ == "__main__":
	main()
