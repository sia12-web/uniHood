"""Education program/year persistence helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.identity import policy, profile_public, schemas
from app.infra.postgres import get_pool


async def get_education(user_id: str) -> schemas.EducationOut:
	"""Return the education record for the given user."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			SELECT program, year, visibility, updated_at
			FROM education
			WHERE user_id = $1
			""",
			user_id,
		)
	if not row:
		return schemas.EducationOut(
			program="",
			year=None,
			visibility="everyone",
			updated_at=datetime.now(timezone.utc),
		)
	return schemas.EducationOut(
		program=row["program"] or "",
		year=row["year"],
		visibility=row["visibility"],
		updated_at=row["updated_at"],
	)


async def patch_education(user_id: str, payload: schemas.EducationPatch) -> schemas.EducationOut:
	"""Upsert and validate the user's education record."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			row = await conn.fetchrow(
				"""
				SELECT program, year, visibility
				FROM education
				WHERE user_id = $1
				FOR UPDATE
				""",
				user_id,
			)
			program = row["program"] if row else ""
			year = row["year"] if row else None
			visibility = row["visibility"] if row else "everyone"

			if payload.program is not None:
				program = payload.program.strip()
			if payload.year is not None:
				year = payload.year
			if payload.visibility is not None:
				visibility = payload.visibility

			if visibility not in {"everyone", "friends", "none"}:
				raise policy.IdentityPolicyError("education_visibility_invalid")
			policy.validate_education(program, year)

			await conn.execute(
				"""
				INSERT INTO education (user_id, program, year, visibility, updated_at)
				VALUES ($1, $2, $3, $4, NOW())
				ON CONFLICT (user_id)
				DO UPDATE SET program = EXCLUDED.program,
					year = EXCLUDED.year,
					visibility = EXCLUDED.visibility,
					updated_at = NOW()
				""",
				user_id,
				program,
				year,
				visibility,
			)
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await get_education(user_id)
