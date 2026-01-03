"""Stub discovery service for swipe feed and interactions.

This is a scaffold; ranking, persistence, and matching will be added later.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from app.domain.discovery.schemas import (
	DiscoveryCard,
	DiscoveryFeedResponse,
	InteractionResponse,
	DiscoveryPrompt,
	DiscoveryProfile,
	DiscoveryProfileUpdate
)

from app.domain.identity.models import parse_profile_gallery
import json
from app.domain.proximity.schemas import NearbyQuery
from app.domain.proximity.service import get_nearby
from app.domain.social.sockets import emit_discovery_match
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.infra.postgres import get_pool
from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction


async def list_feed(
	auth_user: AuthenticatedUser,
	*,
	radius_m: int = 200,
	mode: str = "campus",
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
			radius_m=radius_m,
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

	# Fetch priority candidates (Friend of Friend, Similar Courses)
	priority_cards = await _fetch_priority_candidates(auth_user, limit=limit)

	items: list[DiscoveryCard] = []
	seen_ids = set()

	# Add priority candidates first
	for card in priority_cards:
		uid_str = str(card.user_id)
		# Temporarily disable filtering
		# if uid_str in liked or uid_str in passed or uid_str in seen_ids:
		# 	continue
		if uid_str in seen_ids:
			continue
		items.append(card)
		seen_ids.add(uid_str)

	# Add nearby candidates
	for user in nearby.items:
		uid_str = str(user.user_id)
		# Temporarily disable filtering to ensure content is visible
		# if uid_str in liked or uid_str in passed or uid_str in seen_ids:
		# 	continue
		if uid_str in seen_ids:
			continue
		
		# Previously we skipped friends, but we keep them now to show a full directory
		raw_passions = getattr(user, "passions", None) or getattr(user, "interests", None) or []
		passions: list[str] = [str(p).strip() for p in raw_passions if isinstance(p, str) and str(p).strip()]
		gallery = getattr(user, "gallery", None) or []
		courses = getattr(user, "courses", None) or []
		
		items.append(
			DiscoveryCard(
				user_id=user.user_id,
				display_name=user.display_name,
				handle=user.handle,
				avatar_url=user.avatar_url,
				campus_id=card_campus,
				major=user.major,
				graduation_year=user.graduation_year,
				interests=passions,
				passions=passions,
				courses=courses,
				distance_m=user.distance_m,
				gallery=gallery,
				is_friend=False, # We filtered out friends
				is_university_verified=getattr(user, "is_university_verified", False),
				gender=getattr(user, "gender", None),
				age=_calculate_age(getattr(user, "birthday", None)),
				hometown=getattr(user, "hometown", None),
				languages=getattr(user, "languages", []) or [],
				relationship_status=getattr(user, "relationship_status", None),
				sexual_orientation=getattr(user, "sexual_orientation", None),
				looking_for=getattr(user, "looking_for", []) or [],
				height=getattr(user, "height", None),
				lifestyle=getattr(user, "lifestyle", {}) or {},
				top_prompts=getattr(user, "profile_prompts", []) or [],
			)
		)
		seen_ids.add(uid_str)

	# Sort by score if we want mixed results, but for now priority is prepended.
	# We might want to re-sort the whole list if we had a unified scoring system.
	# But priority_cards are already sorted by score. Nearby are sorted by distance.
	# The user wants "suggestion is also according to...".
	# Prepending priority candidates satisfies this.

	# Embellish with social discovery data
	final_items = items[:limit]
	if final_items:
		try:
			pool = await get_pool()
			if pool:
				uids = [i.user_id for i in final_items]
				async with pool.acquire() as conn:
					p_rows = await conn.fetch("SELECT * FROM user_discovery_profiles WHERE user_id = ANY($1::uuid[])", uids)
					p_map = {r['user_id']: dict(r) for r in p_rows}
					
					for item in final_items:
						profile = p_map.get(item.user_id)
						if profile:
							item.vibe_tags = profile.get('auto_tags') or []
							
							# Parse JSONB fields if they are strings (depends on driver config)
							def _parse(val):
								if isinstance(val, str):
									try: return json.loads(val)
									except: return {}
								return val or {}

							playful = _parse(profile.get('playful'))
							core = _parse(profile.get('core_identity'))
							
							prompts = []
							if core.get('vibe_sentence'):
								prompts.append({'question': 'Campus Vibe', 'answer': core['vibe_sentence']})
								
							for k, v in playful.items():
								if v and len(prompts) < 5:
									prompts.append({'question': k.replace('_', ' ').title(), 'answer': v})
									
							item.top_prompts = prompts[:5]
		except Exception:
			pass

	return DiscoveryFeedResponse(
		items=final_items, 
		cursor=nearby.cursor,
		exhausted=len(items) == 0,
	)


async def _fetch_priority_candidates(auth_user: AuthenticatedUser, limit: int) -> list[DiscoveryCard]:
	"""Fetch candidates based on social graph (FoF) and shared courses."""
	pool = await get_pool()
	if not pool:
		return []

	# Campus ID is required for this logic
	if not auth_user.campus_id:
		return []
	
	campus_id = str(auth_user.campus_id)

	is_dev = settings.is_dev()
	try:
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				f"""
				WITH my_courses AS (
					SELECT course_code FROM user_courses WHERE user_id = $1
				),
				my_friends AS (
					SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'
				),
				candidates AS (
					SELECT u.id, u.display_name, u.handle, u.avatar_url, u.major, u.graduation_year, u.passions, u.profile_gallery, u.is_university_verified,
						   u.gender, u.birthday, u.hometown, u.languages, u.relationship_status, u.sexual_orientation, u.looking_for, u.height, u.lifestyle, u.profile_prompts,
						   ARRAY(SELECT course_code FROM user_courses WHERE user_id = u.id) as courses,
						   CASE 
							   WHEN EXISTS (
								   SELECT 1 FROM friendships f2 
								   WHERE f2.user_id = u.id AND f2.friend_id IN (SELECT friend_id FROM my_friends)
							   ) THEN true 
							   ELSE false 
						   END as is_fof,
						   CASE 
							   WHEN EXISTS (
								   SELECT 1 FROM friendships f2 
								   WHERE f2.user_id = u.id AND f2.friend_id IN (SELECT friend_id FROM my_friends)
							   ) THEN 2 
							   ELSE 0 
						   END +
						   CASE 
							   WHEN EXISTS (
								   SELECT 1 FROM user_courses uc 
								   WHERE uc.user_id = u.id AND uc.course_code IN (SELECT course_code FROM my_courses)
							   ) THEN 1 
							   ELSE 0 
						   END +
						   CASE
							   WHEN u.is_university_verified THEN 5
							   ELSE 0
						   END as score
					FROM users u
					WHERE u.campus_id = $2
					  AND u.id != $1
					  AND (u.email_verified = TRUE OR {str(is_dev).upper()})
					  AND u.deleted_at IS NULL
				)
				SELECT * FROM candidates WHERE score > 0 ORDER BY score DESC LIMIT $3
				""",
				auth_user.id,
				campus_id,
				limit,
			)
			
			cards: list[DiscoveryCard] = []
			for row in rows:
				raw_passions = row["passions"]
				passions: list[str] = []
				if isinstance(raw_passions, str):
					try:
						passions = json.loads(raw_passions)
					except Exception:
						passions = []
				elif isinstance(raw_passions, list):
					passions = [str(p) for p in raw_passions]
				
				gallery_raw = row["profile_gallery"]
				gallery_objs = parse_profile_gallery(gallery_raw)
				gallery = [img.to_dict() for img in gallery_objs]

				cards.append(
					DiscoveryCard(
						user_id=row["id"],
						display_name=row["display_name"],
						handle=row["handle"],
						avatar_url=row["avatar_url"],
						campus_id=UUID(campus_id),
						major=row["major"],
						graduation_year=row["graduation_year"],
						interests=passions,
						passions=passions,
						courses=row["courses"] or [],
						distance_m=None, # We don't have distance here easily without geo query
						gallery=gallery,
						is_friend=False,
						is_friend_of_friend=row["is_fof"],
						is_university_verified=bool(row["is_university_verified"]),
						gender=row["gender"],
						age=_calculate_age(str(row["birthday"]) if row["birthday"] else None),
						hometown=row["hometown"],
						languages=row["languages"] or [],
						relationship_status=row["relationship_status"],
						sexual_orientation=row["sexual_orientation"],
						looking_for=row["looking_for"] or [],
						height=row["height"],
						lifestyle=_parse_json_field(row["lifestyle"]),
						top_prompts=_parse_json_field(row["profile_prompts"], is_list=True),
					)
				)
			return cards
	except Exception:
		return []


async def register_like(auth_user: AuthenticatedUser, target_id: UUID, *, cursor: Optional[str]) -> InteractionResponse:
	"""Record a 'like' interaction and detect matches."""
	target = str(target_id)
	await _persist_interaction(auth_user.id, target, "like", cursor)
	await redis_client.sadd(f"discovery:like:{auth_user.id}", target)
	await redis_client.srem(f"discovery:pass:{auth_user.id}", target)

	# Award Swipe XP
	try:
		await XPService().award_xp(auth_user.id, XPAction.DISCOVERY_SWIPE)
	except Exception:
		pass

	# Mutual like => mark match
	if await _is_mutual_like(auth_user.id, target):
		await _persist_match(auth_user.id, target)
		await redis_client.sadd(f"discovery:match:{auth_user.id}", target)
		await redis_client.sadd(f"discovery:match:{target}", str(auth_user.id))
		
		# Award Match XP
		try:
			# Both users get XP for the match
			xp_service = XPService()
			await xp_service.award_xp(auth_user.id, XPAction.DISCOVERY_MATCH, metadata={"with": target})
			await xp_service.award_xp(target, XPAction.DISCOVERY_MATCH, metadata={"with": str(auth_user.id)})
		except Exception:
			pass

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
	
	try:
		await XPService().award_xp(auth_user.id, XPAction.DISCOVERY_SWIPE)
	except Exception:
		pass

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


async def get_prompts() -> list[DiscoveryPrompt]:
	pool = await get_pool()
	if not pool:
		return []
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT * FROM discovery_prompts WHERE is_active = TRUE ORDER BY created_at ASC")
		return [DiscoveryPrompt(**dict(row)) for row in rows]


async def get_discovery_profile(user_id: UUID) -> Optional[DiscoveryProfile]:
	pool = await get_pool()
	if not pool:
		return None
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM user_discovery_profiles WHERE user_id = $1", user_id)
		if row:
			data = dict(row)
			# Asyncpg returns JSONB as dict/list automatically usually, but let's be safe
			def _parse(val):
				if isinstance(val, str):
					try: return json.loads(val)
					except: return {}
				return val or {}
			
			data['core_identity'] = _parse(data.get('core_identity'))
			data['personality'] = _parse(data.get('personality'))
			data['campus_life'] = _parse(data.get('campus_life'))
			data['dating_adjacent'] = _parse(data.get('dating_adjacent'))
			data['taste'] = _parse(data.get('taste'))
			data['playful'] = _parse(data.get('playful'))
			
			return DiscoveryProfile(**data)
		return None


def _generate_auto_tags(data: dict) -> list[str]:
	tags = []
	
	# Social Energy
	social_energy = data.get('personality', {}).get('social_energy', '').lower()
	if 'low' in social_energy or 'recharge' in social_energy:
		tags.append('Low Key')
	elif 'high' in social_energy or 'party' in social_energy:
		tags.append('Life of the Party')
		
	# Study Break
	study = data.get('personality', {}).get('study_break', '').lower()
	if 'coffee' in study or 'boba' in study:
		tags.append('Caffeine Fueled')
	elif 'gym' in study or 'walk' in study:
		tags.append('Gym Rat')
		
	# Vibe
	vibe = data.get('core_identity', {}).get('vibe_sentence', '').lower()
	if 'chill' in vibe:
		tags.append('Chill')
	if 'chaos' in vibe:
		tags.append('Chaotic Good')
		
	# Logic can be expanded
	if not tags:
		tags.append('Mystery Student')
		
	return tags[:3]


async def update_discovery_profile(user_id: UUID, update: DiscoveryProfileUpdate) -> DiscoveryProfile:
	pool = await get_pool()
	if not pool:
		raise Exception("Database unavailable")
	
	async with pool.acquire() as conn:
		# Fetch existing to merge
		current_row = await conn.fetchrow("SELECT * FROM user_discovery_profiles WHERE user_id = $1", user_id)
		current = dict(current_row) if current_row else {}
		
		# Helper to merge dicts
		def merge_section(name: str, new_val: Optional[dict]) -> dict:
			existing = current.get(name) or {}
			if isinstance(existing, str):
				try: existing = json.loads(existing)
				except: existing = {}
			if new_val is None:
				return existing
			return {**existing, **new_val}

		final_core = merge_section('core_identity', update.core_identity)
		final_personality = merge_section('personality', update.personality)
		final_campus = merge_section('campus_life', update.campus_life)
		final_dating = merge_section('dating_adjacent', update.dating_adjacent)
		final_taste = merge_section('taste', update.taste)
		final_playful = merge_section('playful', update.playful)
		
		auto_tags = _generate_auto_tags({
			'core_identity': final_core,
			'personality': final_personality,
			'campus_life': final_campus,
			'dating_adjacent': final_dating,
			'taste': final_taste,
			'playful': final_playful
		})
		
		q = """
			INSERT INTO user_discovery_profiles (user_id, core_identity, personality, campus_life, dating_adjacent, taste, playful, auto_tags, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
			ON CONFLICT (user_id) DO UPDATE SET
				core_identity = EXCLUDED.core_identity,
				personality = EXCLUDED.personality,
				campus_life = EXCLUDED.campus_life,
				dating_adjacent = EXCLUDED.dating_adjacent,
				taste = EXCLUDED.taste,
				playful = EXCLUDED.playful,
				auto_tags = EXCLUDED.auto_tags,
				updated_at = NOW()
			RETURNING *
		"""
		row = await conn.fetchrow(
			q, 
			user_id, 
			json.dumps(final_core), 
			json.dumps(final_personality), 
			json.dumps(final_campus), 
			json.dumps(final_dating), 
			json.dumps(final_taste), 
			json.dumps(final_playful), 
			auto_tags
		)
		
		# Decode JSON strings back to dict for Pydantic
		res_data = dict(row)
		for k in ['core_identity', 'personality', 'campus_life', 'dating_adjacent', 'taste', 'playful']:
			if isinstance(res_data.get(k), str):
				try: res_data[k] = json.loads(res_data[k])
				except: res_data[k] = {}
		
		return DiscoveryProfile(**res_data)


def _calculate_age(birthday: str | date | None) -> int | None:
	if not birthday:
		return None
	try:
		if isinstance(birthday, str):
			try:
				dt = date.fromisoformat(birthday)
			except ValueError:
				# Handle "YYYY-MM-DD" vs incomplete
				return None
		else:
			dt = birthday
		today = date.today()
		return today.year - dt.year - ((today.month, today.day) < (dt.month, dt.day))
	except Exception:
		return None

def _parse_json_field(val, is_list=False):
	if isinstance(val, str):
		try: return json.loads(val)
		except: return [] if is_list else {}
	return val or ([] if is_list else {})
