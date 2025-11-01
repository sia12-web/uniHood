"""User social link CRUD helpers."""

from __future__ import annotations

from typing import List

from app.domain.identity import policy, profile_public, schemas
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


async def list_links(user_id: str) -> List[schemas.MyLink]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT user_id, kind, url, visibility
			FROM social_links
			WHERE user_id = $1
			ORDER BY kind ASC
			""",
			user_id,
		)
	return [
		schemas.MyLink(kind=row["kind"], url=row["url"], visibility=row["visibility"])
		for row in rows
	]


async def upsert_link(user_id: str, payload: schemas.LinkUpsertRequest) -> List[schemas.MyLink]:
	await policy.enforce_link_update_rate(user_id)
	kind = payload.kind.strip().lower()
	url = str(payload.url).strip()
	policy.validate_link(kind, url)
	visibility = payload.visibility or "everyone"
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO social_links (user_id, kind, url, visibility)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (user_id, kind)
			DO UPDATE SET url = EXCLUDED.url,
				visibility = EXCLUDED.visibility
			""",
			user_id,
			kind,
			url,
			visibility,
		)
	obs_metrics.inc_identity_links_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_links(user_id)


async def remove_link(user_id: str, kind: str) -> List[schemas.MyLink]:
	await policy.enforce_link_update_rate(user_id)
	kind_norm = kind.strip().lower()
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute("DELETE FROM social_links WHERE user_id = $1 AND kind = $2", user_id, kind_norm)
	obs_metrics.inc_identity_links_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_links(user_id)


async def update_link_visibility(user_id: str, kind: str, visibility: str) -> List[schemas.MyLink]:
	await policy.enforce_link_update_rate(user_id)
	if visibility not in {"everyone", "friends", "none"}:
		raise policy.IdentityPolicyError("link_visibility_invalid")
	kind_norm = kind.strip().lower()
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			UPDATE social_links
			SET visibility = $3
			WHERE user_id = $1 AND kind = $2
			""",
			user_id,
			kind_norm,
			visibility,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("link_not_found")
	obs_metrics.inc_identity_links_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_links(user_id)
