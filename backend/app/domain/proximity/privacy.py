"""Helpers that fetch privacy preferences and relationships from Postgres."""

from __future__ import annotations

from typing import Dict, Iterable, Sequence
import json

from app.domain.proximity.models import PrivacySettings
from app.infra.postgres import get_pool


async def load_privacy(user_ids: Sequence[str]) -> Dict[str, PrivacySettings]:
	if not user_ids:
		return {}
	pool = await get_pool()
	rows = await pool.fetch(
		"SELECT id, privacy FROM users WHERE id = ANY($1::uuid[])", list({uid for uid in user_ids})
	)
	mapping: Dict[str, PrivacySettings] = {}
	for row in rows:
		data = row["privacy"] or {}
		if isinstance(data, str):
			try:
				parsed = json.loads(data)
				if isinstance(parsed, dict):
					data = parsed
				elif isinstance(parsed, str):
					data = {"visibility": parsed}
				else:
					data = {}
			except Exception:
				data = {"visibility": data}
		mapping[str(row["id"])] = PrivacySettings(
			visibility=data.get("visibility", "everyone"),
			blur_distance_m=int(data.get("blur_distance_m", 0) or 0),
			ghost_mode=bool(data.get("ghost_mode", False)),
		)
	return mapping


async def load_friendship_flags(self_id: str, user_ids: Sequence[str]) -> Dict[str, bool]:
	if not user_ids:
		return {}
	pool = await get_pool()
	rows = await pool.fetch(
		"""
		SELECT friend_id
		FROM friendships
		WHERE user_id = $1::uuid AND friend_id = ANY($2::uuid[]) AND status = 'accepted'
		""",
		self_id,
		list({uid for uid in user_ids}),
	)
	return {str(row["friend_id"]): True for row in rows}


async def load_blocks(self_id: str, user_ids: Iterable[str]) -> Dict[str, bool]:
	ids = list({uid for uid in user_ids})
	if not ids:
		return {}
	pool = await get_pool()
	rows = await pool.fetch(
		"""
		SELECT friend_id, status
		FROM friendships
		WHERE user_id = $1::uuid AND friend_id = ANY($2::uuid[]) AND status = 'blocked'
		UNION
		SELECT user_id, status
		FROM friendships
		WHERE friend_id = $1::uuid AND user_id = ANY($2::uuid[]) AND status = 'blocked'
		""",
		self_id,
		ids,
	)
	return {str(row[0]): True for row in rows}

