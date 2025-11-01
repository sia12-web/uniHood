"""User skill management helpers."""

from __future__ import annotations

from typing import List

from app.domain.identity import policy, profile_public, schemas
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


async def list_user_skills(user_id: str) -> List[schemas.MySkill]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT user_id, name, display, proficiency, visibility, added_at
			FROM user_skills
			WHERE user_id = $1
			ORDER BY added_at DESC
			""",
			user_id,
		)
	return [
		schemas.MySkill(
			name=row["name"],
			display=row["display"],
			proficiency=row["proficiency"],
			visibility=row["visibility"],
			added_at=row["added_at"],
		)
		for row in rows
	]


async def upsert_skill(user_id: str, payload: schemas.SkillUpsertRequest) -> List[schemas.MySkill]:
	await policy.enforce_skill_update_rate(user_id)
	name = policy.normalise_skill_name(payload.name)
	display = payload.display.strip()
	policy.validate_skill(display, payload.proficiency)
	visibility = payload.visibility or "everyone"
	if visibility not in {"everyone", "friends", "none"}:
		raise policy.IdentityPolicyError("skill_visibility_invalid")
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO user_skills (user_id, name, display, proficiency, visibility)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, name)
			DO UPDATE SET display = EXCLUDED.display,
				proficiency = EXCLUDED.proficiency,
				visibility = EXCLUDED.visibility,
				added_at = NOW()
			""",
			user_id,
			name,
			display,
			payload.proficiency,
			visibility,
		)
	obs_metrics.inc_identity_skills_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_user_skills(user_id)


async def remove_skill(user_id: str, name: str) -> List[schemas.MySkill]:
	await policy.enforce_skill_update_rate(user_id)
	norm = policy.normalise_skill_name(name)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute("DELETE FROM user_skills WHERE user_id = $1 AND name = $2", user_id, norm)
	obs_metrics.inc_identity_skills_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_user_skills(user_id)


async def update_skill_visibility(user_id: str, name: str, visibility: str) -> List[schemas.MySkill]:
	await policy.enforce_skill_update_rate(user_id)
	if visibility not in {"everyone", "friends", "none"}:
		raise policy.IdentityPolicyError("skill_visibility_invalid")
	norm = policy.normalise_skill_name(name)
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			UPDATE user_skills
			SET visibility = $3,
				added_at = NOW()
			WHERE user_id = $1 AND name = $2
			""",
			user_id,
			norm,
			visibility,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("skill_not_found")
	obs_metrics.inc_identity_skills_update()
	await profile_public.rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
	return await list_user_skills(user_id)
