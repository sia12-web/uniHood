"""People matching helpers leveraging public profile projections."""

from __future__ import annotations

import json
from typing import List, Optional, Sequence, Tuple

from app.domain.identity import schemas
from app.domain.identity.profile_public import _avatar_url as _pp_avatar_url
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


class MatchInputError(ValueError):
	"""Raised when insufficient filters are provided to the matcher."""


def _normalise_terms(values: Optional[Sequence[str]]) -> List[str]:
	if not values:
		return []
	normed: List[str] = []
	for value in values:
		if not value:
			continue
		norm = value.strip().lower()
		if norm:
			normed.append(norm)
	return list(dict.fromkeys(normed))


def _safe_prof(value: object) -> int:
	try:
		prof = int(value)
	except (TypeError, ValueError):
		prof = 1
	return min(5, max(1, prof))


async def match_people(
	*,
	viewer_id: Optional[str],
	campus_id: Optional[str] = None,
	interests: Optional[Sequence[str]] = None,
	skills: Optional[Sequence[str]] = None,
	limit: int = 20,
) -> List[schemas.MatchPerson]:
	"""Return the best matching people filtered by interests and/or skills."""
	interest_terms = _normalise_terms(interests)
	skill_terms = _normalise_terms(skills)
	if not interest_terms and not skill_terms:
		raise MatchInputError("filters_required")
	pool = await get_pool()
	async with pool.acquire() as conn:
		params: List[object] = []
		conditions: List[str] = []
		if viewer_id:
			conditions.append("p.user_id <> $1")
			params.append(viewer_id)
		if campus_id:
			conditions.append(f"p.campus_id = ${len(params) + 1}")
			params.append(campus_id)
		if interest_terms:
			conditions.append(f"p.interests && ${len(params) + 1}::text[]")
			params.append(interest_terms)
		where_clause = " AND ".join(conditions) if conditions else "TRUE"
		rows = await conn.fetch(
			f"""
			SELECT p.user_id, p.handle, p.display_name, p.avatar_key, p.campus_id, p.bio,
				p.interests, p.skills, u.avatar_url
			FROM public_profiles p
			JOIN users u ON u.id = p.user_id
			WHERE {where_clause}
			ORDER BY p.updated_at DESC
			LIMIT ${len(params) + 1}
			""",
			*params,
			max(limit * 3, 20),
		)

	interest_set = set(interest_terms)
	skill_set = set(skill_terms)
	results: List[Tuple[float, schemas.MatchPerson]] = []
	for row in rows:
		row_interests = list(row["interests"] or [])
		skills_payload = row["skills"] or []
		if isinstance(skills_payload, str):
			skills_payload = json.loads(skills_payload or "[]")
		interest_hits = len(interest_set.intersection({item.lower() for item in row_interests})) if interest_set else 0
		skill_hits = 0
		if skill_set and skills_payload:
			for item in skills_payload:
				name = (item.get("name") or "").lower()
				if name in skill_set:
					skill_hits += 1
		if interest_set and not interest_hits and not skill_set:
			continue
		if skill_set and not skill_hits and not interest_set:
			continue
		if interest_set and skill_set and interest_hits + skill_hits == 0:
			continue
		score = float(interest_hits * 2 + skill_hits)
		if interest_set or skill_set:
			if score <= 0:
				continue
		skill_models = [
			schemas.PublicSkill(display=item.get("display", ""), proficiency=_safe_prof(item.get("proficiency")))
			for item in skills_payload
		]
		profile = schemas.MatchPerson(
			user_id=row["user_id"],
			handle=row["handle"],
			display_name=row["display_name"],
			avatar_url=_pp_avatar_url(row["avatar_url"], row["avatar_key"]),
			campus_id=row["campus_id"],
			score=score,
			interests=row_interests,
			skills=skill_models,
		)
		results.append((score, profile))

	results.sort(key=lambda item: (-item[0], item[1].display_name.lower()))
	obs_metrics.inc_match_people_query()
	return [profile for _, profile in results[:limit]]
