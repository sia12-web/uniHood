"""Stub discovery service for swipe feed and interactions.

This is a scaffold; ranking, persistence, and matching will be added later.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from app.domain.discovery.schemas import DiscoveryCard, DiscoveryFeedResponse, InteractionResponse
from app.domain.proximity.schemas import NearbyQuery
from app.domain.proximity.service import get_nearby
from app.domain.social.sockets import emit_discovery_match
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.infra.postgres import get_pool


async def list_feed(
	auth_user: AuthenticatedUser,
	*,
	cursor: Optional[str],
	limit: int,
) -> DiscoveryFeedResponse:
	"""Fetch a discovery feed using the proximity service as the initial source."""
	def _safe_uuid(value: Optional[str]) -> Optional[UUID]:
		if not value:
			return None
		try:
			return UUID(str(value))
		except Exception:
			return None

	try:
		query = NearbyQuery(
			campus_id=_safe_uuid(auth_user.campus_id if isinstance(auth_user.campus_id, str) else str(auth_user.campus_id) if auth_user.campus_id else None),
			radius_m=200,
			cursor=cursor,
			limit=min(limit, 100),
			filter="all",
			include=["profile", "distance"],
		)
		nearby = await get_nearby(auth_user, query)
	except Exception:
		# Presence missing or rate limited: return exhausted feed
		return DiscoveryFeedResponse(items=[], cursor=None, exhausted=True)

	card_campus = _safe_uuid(auth_user.campus_id if isinstance(auth_user.campus_id, str) else str(auth_user.campus_id) if auth_user.campus_id else None)

	liked = set(await redis_client.smembers(f"discovery:like:{auth_user.id}") or [])
	passed = set(await redis_client.smembers(f"discovery:pass:{auth_user.id}") or [])

	# Include persisted interactions if available
	try:
		pool = await get_pool()
		if pool:
			async with pool.acquire() as conn:
				rows = await conn.fetch(
					"SELECT target_id, action FROM discovery_interactions WHERE user_id = $1",
					auth_user.id,
				)
				for row in rows:
					if row["action"] == "like":
						liked.add(str(row["target_id"]))
					elif row["action"] == "pass":
						passed.add(str(row["target_id"]))
	except Exception:
		# Fall back to redis-only when DB is unavailable
		pass

	items: list[DiscoveryCard] = []
	for user in nearby.items:
		uid_str = str(user.user_id)
		if uid_str in liked or uid_str in passed:
			continue
		items.append(
			DiscoveryCard(
				user_id=user.user_id,
				display_name=user.display_name,
				handle=user.handle,
				avatar_url=user.avatar_url,
				campus_id=card_campus,
				major=user.major,
				graduation_year=user.graduation_year,
				interests=getattr(user, "passions", []) or getattr(user, "interests", []) or [],
				distance_m=user.distance_m,
			)
		)

	return DiscoveryFeedResponse(
		items=items,
		cursor=nearby.cursor,
		exhausted=len(items) == 0,
	)


async def register_like(auth_user: AuthenticatedUser, target_id: UUID, *, cursor: Optional[str]) -> InteractionResponse:
	"""Record a 'like' interaction and detect matches."""
	target = str(target_id)
	await _persist_interaction(auth_user.id, target, "like", cursor)
	await redis_client.sadd(f"discovery:like:{auth_user.id}", target)
	await redis_client.srem(f"discovery:pass:{auth_user.id}", target)

	# Mutual like => mark match
	if await _is_mutual_like(auth_user.id, target):
		await _persist_match(auth_user.id, target)
		await redis_client.sadd(f"discovery:match:{auth_user.id}", target)
		await redis_client.sadd(f"discovery:match:{target}", str(auth_user.id))
		# Fire real-time match event to both users; best-effort.
		payload = {"peer_id": target}
		try:
			await emit_discovery_match(auth_user.id, payload)
			await emit_discovery_match(target, {"peer_id": auth_user.id})
		except Exception:
			# Socket notification is best-effort; ignore failures.
			pass

	return InteractionResponse(next_cursor=cursor, exhausted=False)


async def register_pass(auth_user: AuthenticatedUser, target_id: UUID, *, cursor: Optional[str]) -> InteractionResponse:
	"""Record a 'pass' interaction."""
	target = str(target_id)
	await _persist_interaction(auth_user.id, target, "pass", cursor)
	await redis_client.sadd(f"discovery:pass:{auth_user.id}", target)
	await redis_client.srem(f"discovery:like:{auth_user.id}", target)
	return InteractionResponse(next_cursor=cursor, exhausted=False)


async def undo_interaction(auth_user: AuthenticatedUser, target_id: UUID, *, cursor: Optional[str]) -> InteractionResponse:
	"""Undo the last interaction with this target."""
	target = str(target_id)
	await _delete_interaction(auth_user.id, target)
	await redis_client.srem(f"discovery:like:{auth_user.id}", target)
	await redis_client.srem(f"discovery:pass:{auth_user.id}", target)
	await redis_client.srem(f"discovery:match:{auth_user.id}", target)
	return InteractionResponse(next_cursor=cursor, exhausted=False)


async def _persist_interaction(user_id: str, target_id: str, action: str, cursor: Optional[str]) -> None:
	try:
		pool = await get_pool()
		if not pool:
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO discovery_interactions (user_id, target_id, action, cursor_token)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (user_id, target_id)
				DO UPDATE SET action = EXCLUDED.action, cursor_token = EXCLUDED.cursor_token, updated_at = NOW()
				""",
				user_id,
				target_id,
				action,
				cursor,
			)
	except Exception:
		# Best-effort; fallback on redis state
		return


async def _delete_interaction(user_id: str, target_id: str) -> None:
	try:
		pool = await get_pool()
		if not pool:
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"DELETE FROM discovery_interactions WHERE user_id = $1 AND target_id = $2",
				user_id,
				target_id,
			)
	except Exception:
		return


async def _persist_match(user_a: str, user_b: str) -> None:
	if user_a == user_b:
		return
	ordered = sorted([user_a, user_b])
	try:
		pool = await get_pool()
		if not pool:
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO discovery_matches (user_a, user_b)
				VALUES ($1, $2)
				ON CONFLICT (user_a, user_b) DO NOTHING
				""",
				ordered[0],
				ordered[1],
			)
	except Exception:
		return


async def _is_mutual_like(user_id: str, target_id: str) -> bool:
	"""Check mutual like using DB when available; fall back to redis."""
	try:
		pool = await get_pool()
		if pool:
			async with pool.acquire() as conn:
				row = await conn.fetchrow(
					"SELECT 1 FROM discovery_interactions WHERE user_id = $1 AND target_id = $2 AND action = 'like'",
					target_id,
					user_id,
				)
				if row:
					return True
	except Exception:
		pass
	# Fallback to redis lookup
	return bool(await redis_client.sismember(f"discovery:like:{target_id}", user_id))
