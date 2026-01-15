"""Feed ranking helpers for the Phase F feed pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple
from uuid import UUID


from app.communities.ranking.feed_ranker import PostFeatures
from app.domain.identity import flags as flag_service
from app.infra.postgres import get_pool

DEFAULT_FEED_COEFF: Dict[str, float] = {
	"alpha": 0.35,
	"beta": 0.35,
	"gamma": 0.15,
	"delta": 0.05,
	"epsilon": 0.05,
	"zeta": 0.05,
}


async def load_feed_candidates(
	viewer_id: str,
	campus_id: Optional[str],
	cursor: Optional[Tuple[datetime, UUID]],
	*,
	limit_pre: int = 1000,
) -> List[dict]:
	"""Fetch raw candidate posts for a viewer ordered by recency."""

	viewer_uuid = UUID(viewer_id)
	campus_uuid = UUID(campus_id) if campus_id else None
	cursor_created: datetime | None = cursor[0] if cursor else None
	cursor_post: UUID | None = cursor[1] if cursor else None

	params: List[object] = [viewer_uuid, campus_uuid]
	where_cursor = ""
	if cursor_created and cursor_post:
		params.extend([cursor_created, cursor_post])
		where_cursor = " AND (p.created_at, p.id) < ($3, $4)"
		limit_param = 5
	else:
		limit_param = 3
	params.append(limit_pre)

	sql = f"""
		SELECT p.id,
		       p.author_id,
		       p.group_id,
		       p.created_at,
		       p.reactions_count,
		       p.comments_count,
		       p.topic_tags,
		       g.campus_id
		FROM post p
		JOIN group_entity g ON g.id = p.group_id
		LEFT JOIN group_member gm
		  ON gm.group_id = p.group_id AND gm.user_id = $1
		WHERE p.deleted_at IS NULL
		  AND p.created_at >= NOW() - INTERVAL '7 days'
		  AND ($2::uuid IS NULL OR g.campus_id = $2::uuid OR g.campus_id IS NULL)
		  AND (
		    gm.user_id IS NOT NULL
		    OR p.author_id = $1
		    OR g.visibility = 'public'
		  )
		{where_cursor}
		ORDER BY p.created_at DESC, p.id DESC
		LIMIT ${limit_param}
	"""

	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(sql, *params)
	return [dict(row) for row in rows]


async def fetch_post_features(
	viewer_id: str,
	candidates: Sequence[dict],
) -> List[PostFeatures]:
	"""Hydrate candidate rows with feature values for ranking."""

	if not candidates:
		return []

	viewer_uuid = UUID(viewer_id)
	post_ids = [str(entry["id"]) for entry in candidates]
	author_ids = {str(entry["author_id"]) for entry in candidates}
	candidate_by_id = {str(entry["id"]): entry for entry in candidates}

	pool = await get_pool()
	async with pool.acquire() as conn:
		friends = await conn.fetch(
			"""
			SELECT friend_id
			FROM friendships
			WHERE user_id = $1 AND status = 'accepted' AND friend_id = ANY($2::uuid[])
			""",
			viewer_uuid,
			list(author_ids),
		)
		reputation = await conn.fetch(
			"""
			SELECT user_id, score
			FROM mod_user_reputation
			WHERE user_id = ANY($1::uuid[])
			""",
			list(author_ids),
		)
		weighted_reactions = await conn.fetch(
			"""
			SELECT subject_id, SUM(effective_weight) AS weight_total
			FROM reaction
			WHERE subject_type = 'post' AND subject_id = ANY($1::uuid[])
			GROUP BY subject_id
			""",
			post_ids,
		)

	friend_set = {str(row["friend_id"]) for row in friends}
	rep_map = {str(row["user_id"]): float(row.get("score") or 0.0) for row in reputation}
	weight_map = {str(row["subject_id"]): float(row.get("weight_total") or 0.0) for row in weighted_reactions}

	features: List[PostFeatures] = []
	for post_id, entry in candidate_by_id.items():
		created_at = entry["created_at"]
		if isinstance(created_at, datetime) is False:
			continue
		author_id = str(entry["author_id"])
		campus_val = entry.get("campus_id")
		trust_value = rep_map.get(author_id, 60.0) / 100.0
		trust_value = max(0.0, min(1.0, trust_value))
		reaction_weight = weight_map.get(post_id)
		likes_value = (
			reaction_weight
			if reaction_weight is not None
			else float(entry.get("reactions_count") or 0)
		)
		features.append(
			PostFeatures(
				post_id=post_id,
				author_id=author_id,
				campus_id=str(campus_val) if campus_val else None,
				created_at=created_at,
				likes=likes_value,
				comments=int(entry.get("comments_count") or 0),
				saves=0,
				shares=0,
				is_friend=author_id in friend_set,
				is_fof=False,
				author_trust=trust_value,
				author_rep=trust_value,
				match_jaccard=0.0,
			)
		)
	return features


async def resolve_feed_coefficients(user_id: str, campus_id: Optional[str]) -> Dict[str, float]:
	"""Return feed weighting coefficients using feature flags when present."""

	_ = (user_id, campus_id)
	flag = await flag_service.get_flag("feed.rank.v1.coeff")
	if not flag or not isinstance(flag.payload, dict):
		return dict(DEFAULT_FEED_COEFF)

	coeff = dict(DEFAULT_FEED_COEFF)
	for key, value in flag.payload.items():
		if key in coeff:
			try:
				coeff[key] = float(value)
			except (TypeError, ValueError):
				continue
	return coeff


async def feed_rank_enabled(user_id: str, campus_id: Optional[str]) -> bool:
	"""Check feature flag toggle for feed ranking."""

	result = await flag_service.evaluate_flag(
		"feed.rank.v1.enabled",
		user_id=user_id,
		campus_id=campus_id,
	)
	if result.enabled is None:
		return True
	return bool(result.enabled)
