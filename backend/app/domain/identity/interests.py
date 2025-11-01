"""Interest taxonomy and user-interest management helpers."""

from __future__ import annotations

import json
from typing import Iterable, List, Optional
from uuid import UUID

from app.domain.identity import models, policy, profile_public, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

SUGGEST_TTL_SECONDS = 24 * 3600


def _interest_row_to_schema(row) -> schemas.InterestNode:
	return schemas.InterestNode(
		id=row["id"],
		slug=row["slug"],
		name=row["name"],
		parent_id=row.get("parent_id"),
	)


async def list_taxonomy(*, limit: int = 200, offset: int = 0, parent_id: Optional[UUID] = None) -> List[schemas.InterestNode]:
	"""Return a slice of the interests taxonomy."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		if parent_id:
			rows = await conn.fetch(
				"""
				SELECT id, slug, name, parent_id
				FROM interests
				WHERE parent_id = $1
				ORDER BY name ASC
				LIMIT $2 OFFSET $3
				""",
				parent_id,
				limit,
				offset,
			)
		else:
			rows = await conn.fetch(
				"""
				SELECT id, slug, name, parent_id
				FROM interests
				ORDER BY name ASC
				LIMIT $1 OFFSET $2
				""",
				limit,
				offset,
			)
	return [_interest_row_to_schema(row) for row in rows]


async def _fetch_suggestions(conn, q: str, *, limit: int = 10) -> Iterable[models.Interest]:
	like = f"%{q}%"
	rows = await conn.fetch(
		"""
		SELECT id, slug, name, parent_id, created_at
		FROM interests
		WHERE name ILIKE $1 OR slug ILIKE $1
		ORDER BY
			CASE WHEN lower(name) LIKE $2 THEN 0 ELSE 1 END,
			SIMILARITY(name, $3) DESC,
			name ASC
		LIMIT $4
		""",
		like,
		f"{q}%",
		q,
		limit,
	)
	return [models.Interest.from_record(row) for row in rows]


async def suggest_interests(*, query: str, campus_id: Optional[str] = None, limit: int = 10) -> List[schemas.InterestNode]:
	"""Return suggested interests with Redis-backed caching."""
	q_norm = query.strip().lower()
	if len(q_norm) < 2:
		return []
	cache_key = f"sug:interest:{campus_id or 'global'}:{q_norm}"
	cached = await redis_client.get(cache_key)
	if cached:
		if isinstance(cached, bytes):
			cached = cached.decode("utf-8")
		payload = json.loads(cached)
		return [schemas.InterestNode(**item) for item in payload]
	pool = await get_pool()
	async with pool.acquire() as conn:
		matches = await _fetch_suggestions(conn, q_norm, limit=limit)
	results = [
		schemas.InterestNode(id=item.id, slug=item.slug, name=item.name, parent_id=item.parent_id)
		for item in matches
	]
	await redis_client.set(
		cache_key,
		json.dumps([result.model_dump(mode="json") for result in results]),
		ex=SUGGEST_TTL_SECONDS,
	)
	return results


async def get_user_interests(user_id: str) -> List[schemas.MyInterest]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT ui.user_id, ui.interest_id, ui.visibility, ui.added_at, i.name, i.slug
			FROM user_interests ui
			JOIN interests i ON i.id = ui.interest_id
			WHERE ui.user_id = $1
			ORDER BY ui.added_at DESC
			""",
			user_id,
		)
	return [
		schemas.MyInterest(
			interest_id=row["interest_id"],
			slug=row["slug"],
			name=row["name"],
			visibility=row["visibility"],
			added_at=row["added_at"],
		)
		for row in rows
	]


async def _ensure_interest_exists(conn, interest_id: UUID) -> None:
	row = await conn.fetchrow("SELECT 1 FROM interests WHERE id = $1", interest_id)
	if not row:
		raise policy.IdentityPolicyError("interest_not_found")


async def add_user_interest(user_id: str, interest_id: UUID, visibility: Optional[str]) -> List[schemas.MyInterest]:
	await policy.enforce_interest_update_rate(user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_interest_exists(conn, interest_id)
			vis = visibility or "everyone"
			if vis not in {"everyone", "friends", "none"}:
				raise policy.IdentityPolicyError("interest_visibility_invalid")
			await conn.execute(
				"""
				INSERT INTO user_interests (user_id, interest_id, visibility)
				VALUES ($1, $2, $3)
				ON CONFLICT (user_id, interest_id)
				DO UPDATE SET visibility = EXCLUDED.visibility,
					added_at = NOW()
				""",
				user_id,
				interest_id,
				vis,
			)
		obs_metrics.inc_identity_interests_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await get_user_interests(user_id)


async def remove_user_interest(user_id: str, interest_id: UUID) -> List[schemas.MyInterest]:
	await policy.enforce_interest_update_rate(user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"DELETE FROM user_interests WHERE user_id = $1 AND interest_id = $2",
			user_id,
			interest_id,
		)
	obs_metrics.inc_identity_interests_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await get_user_interests(user_id)


async def update_interest_visibility(user_id: str, interest_id: UUID, visibility: str) -> List[schemas.MyInterest]:
	await policy.enforce_interest_update_rate(user_id)
	if visibility not in {"everyone", "friends", "none"}:
		raise policy.IdentityPolicyError("interest_visibility_invalid")
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			UPDATE user_interests
			SET visibility = $3,
				added_at = NOW()
			WHERE user_id = $1 AND interest_id = $2
			""",
			user_id,
			interest_id,
			visibility,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("interest_not_found")
	obs_metrics.inc_identity_interests_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await get_user_interests(user_id)
