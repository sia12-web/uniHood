"""Proximity service logic following the Phase 1 specification."""

from __future__ import annotations

import base64
import json
import math
import logging
import time
from typing import Dict, List, Optional, Sequence, Tuple
from uuid import UUID

from app.domain.identity.models import parse_profile_gallery
from app.domain.proximity.models import PrivacySettings
from app.domain.proximity.privacy import load_blocks, load_friendship_flags, load_privacy
from app.domain.proximity.schemas import NearbyQuery, NearbyResponse, NearbyUser
from app.domain.identity import schemas as identity_schemas
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.rate_limit import RateLimitExceeded, allow
from app.infra.redis import redis_client
from app.settings import settings

logger = logging.getLogger(__name__)

PresenceTuple = Tuple[str, float]


# Demo nearby disabled: only real accounts are returned in all environments.


def round_up_to_bucket(distance: float, bucket: int) -> int:
	if bucket <= 0:
		return int(distance)
	return int(math.ceil(max(distance, 0.0) / bucket) * bucket)


def _decode_cursor(cursor: str) -> Tuple[str, int]:
	raw = base64.b64decode(cursor).decode("utf-8")
	uid, dist_mm = raw.split(":", 1)
	return uid, int(dist_mm)


def _encode_cursor(uid: str, distance_m: float) -> str:
	return base64.b64encode(f"{uid}:{int(distance_m * 1000)}".encode("utf-8")).decode("utf-8")


async def _load_user_lite(user_ids: Sequence[str]) -> Dict[str, Dict[str, object]]:
	if not user_ids:
		return {}
	pool = await get_pool()
	is_dev = settings.is_dev()
	rows = await pool.fetch(
		f"""
		SELECT u.id, u.display_name, u.handle, u.avatar_url, u.major, u.bio, u.graduation_year, u.profile_gallery, u.passions, u.ten_year_vision, u.social_links, u.status, u.is_university_verified,
		       u.gender, u.birthday, u.hometown, u.languages, u.relationship_status, u.sexual_orientation, u.looking_for, u.height, u.lifestyle, u.profile_prompts,
		       c.name as campus_name,
		       ARRAY(SELECT course_code FROM user_courses WHERE user_id = u.id) as courses
		FROM users u
		LEFT JOIN campuses c ON u.campus_id = c.id
		WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL AND (u.email_verified = TRUE OR {str(is_dev).upper()})
		""",
		list({uid for uid in user_ids}),
	)
	
	def _parse_dict(val):
		if isinstance(val, str):
			try:
				return json.loads(val)
			except:
				return {}
		return val or {}

	return {
		str(row["id"]): {
			"display_name": row["display_name"],
			"handle": row["handle"],
			"avatar_url": row["avatar_url"],
			"campus_name": row["campus_name"],
			"major": row.get("major"),
			"bio": row.get("bio"),
			"graduation_year": row.get("graduation_year"),
			"gallery": [image.to_dict() for image in parse_profile_gallery(row.get("profile_gallery"))],
			"passions": json.loads(row["passions"]) if isinstance(row.get("passions"), str) else (row.get("passions") or []),
			"courses": row.get("courses") or [],
			"ten_year_vision": row.get("ten_year_vision"),
			"social_links": _parse_dict(row.get("social_links")),
			"status": _parse_dict(row.get("status")),
			"is_university_verified": bool(row.get("is_university_verified", False)),
			"gender": row.get("gender"),
			"birthday": str(row["birthday"]) if row.get("birthday") else None,
			"hometown": row.get("hometown"),
			"languages": row.get("languages") or [],
			"relationship_status": row.get("relationship_status"),
			"sexual_orientation": row.get("sexual_orientation"),
			"looking_for": row.get("looking_for") or [],
			"height": row.get("height"),
			"lifestyle": _parse_dict(row.get("lifestyle")),
			"profile_prompts": _parse_dict(row.get("profile_prompts")) if isinstance(row.get("profile_prompts"), str) else (row.get("profile_prompts") or []),
		}
		for row in rows
	}


async def _fetch_live_candidates(key: str, auth_user_id: str, *, radius: int, center: Tuple[float, float]) -> List[PresenceTuple]:
	lon_user, lat_user = center
	results = await redis_client.geosearch(
		key,
		longitude=lon_user,
		latitude=lat_user,
		radius=radius,
		unit="m",
		withdist=True,
		sort="ASC",
		count=1000,
	)
	logger.info(
		"_fetch_live_candidates: key=%s auth_user=%s radius=%s center=(%s,%s) raw_results=%s",
		key, auth_user_id, radius, lon_user, lat_user, len(results)
	)
	live: List[PresenceTuple] = []
	# Treat entries as stale if the last heartbeat timestamp is too old,
	# so closing a client window quickly removes users from Nearby.
	stale_ms = int(settings.presence_stale_seconds * 1000)
	now_ms = int(time.time() * 1000)
	for member_id, distance in results:
		member_id = str(member_id)
		if member_id == auth_user_id:
			logger.debug("_fetch_live_candidates: skipping self %s", member_id)
			continue
		# Skip when key is missing (TTL == -2)
		ttl = await redis_client.ttl(f"presence:{member_id}")
		if ttl == -2:
			logger.debug("_fetch_live_candidates: skipping %s - presence key expired (ttl=-2)", member_id)
			continue
		# Also skip when the last heartbeat is older than the stale threshold
		ts_raw = await redis_client.hget(f"presence:{member_id}", "ts")
		try:
			if not ts_raw:
				logger.debug("_fetch_live_candidates: skipping %s - no timestamp in presence", member_id)
				continue
			ts_ms = int(ts_raw)
			if now_ms - ts_ms > stale_ms:
				logger.debug("_fetch_live_candidates: skipping %s - stale (age=%sms > %sms)", member_id, now_ms - ts_ms, stale_ms)
				continue
		except Exception:
			# If we cannot parse ts, err on the side of not showing the user
			continue
		live.append((member_id, float(distance)))
	return live


async def _fetch_directory_candidates(
	campus_id: Optional[UUID], 
	auth_user_id: UUID, 
	lat: Optional[float], 
	lon: Optional[float], 
	limit: int, 
	offset: int = 0,
	exclude_campus_id: Optional[UUID] = None
) -> List[PresenceTuple]:
	"""Fetch directory candidates from DB.
	
	Args:
		campus_id: If set, only return users from this campus. If None, return from all campuses.
		auth_user_id: The requesting user's ID (excluded from results).
		lat, lon: User's location for distance calculation.
		limit, offset: Pagination parameters.
		exclude_campus_id: If set, exclude users from this campus (used for City mode to show only other campuses).
	"""
	pool = await get_pool()
	
	# Limit queries to return dummy data for now
	# ...
	
	is_dev = settings.is_dev()
	# Only force show unverified users in development mode
	force_show = str(is_dev).upper()

	if lat is None or lon is None:
		# Fallback: return users ordered by creation date if we don't know where the user is
		if campus_id:
			rows = await pool.fetch(
				f"""
				SELECT id FROM users u
				WHERE campus_id = $1 AND id != $2 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
				ORDER BY created_at DESC
				LIMIT $3 OFFSET $4
				""",
				campus_id,
				auth_user_id,
				limit,
				offset,
			)
		elif exclude_campus_id:
			# City mode: exclude users from the viewer's own campus
			rows = await pool.fetch(
				f"""
				SELECT id FROM users u
				WHERE id != $1 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
				AND ($2::uuid IS NULL OR campus_id IS NULL OR campus_id != $2)
				ORDER BY created_at DESC
				LIMIT $3 OFFSET $4
				""",
				auth_user_id,
				exclude_campus_id,
				limit,
				offset,
			)
		else:
			rows = await pool.fetch(
				f"""
				SELECT id FROM users u
				WHERE id != $1 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
				ORDER BY created_at DESC
				LIMIT $2 OFFSET $3
				""",
				auth_user_id,
				limit,
				offset,
			)
		return [(str(row["id"]), 0.0) for row in rows]

	# Haversine formula in SQL
	# 6371000 is Earth radius in meters
	# In Directory mode, we show all users but sort by distance if location is available.
	if campus_id:
		rows = await pool.fetch(
			f"""
			SELECT id, 
				CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN
					(6371000 * acos(LEAST(1.0, GREATEST(-1.0, 
						cos(radians($3)) * cos(radians(lat)) * cos(radians(lon) - radians($4)) + 
						sin(radians($3)) * sin(radians(lat))
					))))
				ELSE NULL END AS distance
			FROM users u
			WHERE campus_id = $1 AND id != $2 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
			ORDER BY distance ASC NULLS LAST
			LIMIT $5 OFFSET $6
			""",
			campus_id,
			auth_user_id,
			lat,
			lon,
			limit,
			offset,
		)
	elif exclude_campus_id:
		# City mode: exclude users from the viewer's own campus, with distance calculation
		rows = await pool.fetch(
			f"""
			SELECT id, 
				CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN
					(6371000 * acos(LEAST(1.0, GREATEST(-1.0, 
						cos(radians($2)) * cos(radians(lat)) * cos(radians(lon) - radians($3)) + 
						sin(radians($2)) * sin(radians(lat))
					))))
				ELSE NULL END AS distance
			FROM users u
			WHERE id != $1 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
			AND (campus_id IS NULL OR campus_id != $4)
			ORDER BY distance ASC NULLS LAST
			LIMIT $5 OFFSET $6
			""",
			auth_user_id,
			lat,
			lon,
			exclude_campus_id,
			limit,
			offset,
		)
	else:
		rows = await pool.fetch(
			f"""
			SELECT id, 
				CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN
					(6371000 * acos(LEAST(1.0, GREATEST(-1.0, 
						cos(radians($2)) * cos(radians(lat)) * cos(radians(lon) - radians($3)) + 
						sin(radians($2)) * sin(radians(lat))
					))))
				ELSE NULL END AS distance
			FROM users u
			WHERE id != $1 AND deleted_at IS NULL AND (email_verified = TRUE OR {force_show})
			ORDER BY distance ASC NULLS LAST
			LIMIT $4 OFFSET $5
			""",
			auth_user_id,
			lat,
			lon,
			limit,
			offset,
		)
	return [(str(row["id"]), float(row["distance"]) if row["distance"] is not None else 0.0) for row in rows]


async def get_nearby(auth_user: AuthenticatedUser, query: NearbyQuery) -> NearbyResponse:
	limit = 300 if settings.is_dev() else 30
	if not await allow("nearby", auth_user.id, limit=limit):
		raise RateLimitExceeded("nearby")

	raw_campus = query.campus_id or auth_user.campus_id
	try:
		campus_id = UUID(str(raw_campus)) if raw_campus else None
	except ValueError:
		campus_id = None
		
	try:
		auth_user_id = UUID(str(auth_user.id))
	except ValueError:
		raise LookupError("invalid_user_id")

	# Handle the three discovery modes explicitly
	# Room mode: Live proximity via Redis, 100m radius, ALL campuses (cross-campus)
	if query.mode == "room":
		# Room mode uses the global geo key for cross-campus discovery
		presence_key = f"presence:{auth_user.id}"
		user_presence = await redis_client.hgetall(presence_key)
		if not user_presence:
			raise LookupError("presence_not_found")
		
		lon_raw = user_presence.get("lon")
		lat_raw = user_presence.get("lat")
		try:
			lon_user = float(lon_raw) if lon_raw is not None else None
			lat_user = float(lat_raw) if lat_raw is not None else None
		except (TypeError, ValueError):
			lon_user = None
			lat_user = None
		if lon_user is None or lat_user is None:
			# User has not shared location (or presence is incomplete). Treat as no nearby results.
			return NearbyResponse(items=[], cursor=None)
		
		# Use global geo key for cross-campus Room mode
		geo_key = "geo:presence:global"
		effective_radius = min(query.radius_m, 100)  # Room mode capped at 100m
		
		live = await _fetch_live_candidates(
			geo_key, auth_user.id, radius=effective_radius, center=(lon_user, lat_user)
		)
		
		logger.warning(
			"room mode query radius=%s effective_radius=%s center=(%s,%s) candidates=%s candidate_ids=%s",
			query.radius_m,
			effective_radius,
			lon_user,
			lat_user,
			len(live),
			[uid for uid, _ in live],
		)
		
		# Process results same as existing proximity mode
		user_ids = [uid for uid, _ in live]
		privacy_map = await load_privacy(user_ids)
		friends_map = await load_friendship_flags(auth_user.id, user_ids)
		blocks_map = await load_blocks(auth_user.id, user_ids)

		filtered: List[Tuple[str, float, PrivacySettings, bool]] = []
		for uid, distance_m in live:
			if blocks_map.get(uid):
				logger.debug("room mode: filtering out %s - blocked", uid)
				continue
			privacy_settings = privacy_map.get(uid, PrivacySettings())
			is_friend = bool(friends_map.get(uid))
			if query.filter == "friends" and not is_friend:
				logger.debug("room mode: filtering out %s - not a friend (filter=friends)", uid)
				continue
			if not privacy_settings.allows_visibility(is_friend):
				logger.debug("room mode: filtering out %s - privacy settings (is_friend=%s)", uid, is_friend)
				continue
			filtered.append((uid, distance_m, privacy_settings, is_friend))
		
		logger.info(
			"room mode: after filtering: %s users remain (from %s candidates)",
			len(filtered),
			len(live),
		)

		page = filtered[: query.limit]
		profiles = await _load_user_lite([uid for uid, *_ in page])
		include_distance = not query.include or "distance" in query.include

		items: List[NearbyUser] = []
		for uid, distance_m, privacy_settings, is_friend in page:
			profile = profiles.get(uid)
			if not profile:
				logger.debug("room mode: skipping %s - no profile found", uid)
				continue
			if profile.get("display_name") == "Deleted User" or str(profile.get("handle", "")).startswith("deleted-"):
				logger.debug("room mode: skipping %s - deleted user", uid)
				continue
			distance_value = None
			if include_distance:
				blur = max(int(privacy_settings.blur_distance_m or 0), 10)
				distance_value = round_up_to_bucket(distance_m, blur)
			items.append(
				NearbyUser(
					user_id=UUID(uid),
					display_name=profile["display_name"],
					handle=profile["handle"],
					avatar_url=profile.get("avatar_url"),
					major=profile.get("major"),
					distance_m=distance_value,
					is_friend=is_friend,
					bio=profile.get("bio") or None,
					graduation_year=profile.get("graduation_year"),
					gallery=profile.get("gallery", []),
					passions=profile.get("passions", []),
					courses=profile.get("courses") or [],
					campus_name=profile.get("campus_name"),
					ten_year_vision=profile.get("ten_year_vision"),
					social_links=identity_schemas.SocialLinks(**(profile.get("social_links") or {})),
					banner_url=(profile.get("status") or {}).get("banner_url"),
					is_university_verified=profile.get("is_university_verified", False),
					gender=profile.get("gender"),
					birthday=profile.get("birthday"),
					hometown=profile.get("hometown"),
					languages=profile.get("languages") or [],
					relationship_status=profile.get("relationship_status"),
					sexual_orientation=profile.get("sexual_orientation"),
					looking_for=profile.get("looking_for") or [],
					height=profile.get("height"),
					lifestyle=profile.get("lifestyle") or {},
					profile_prompts=profile.get("profile_prompts") or [],
				)
			)

		logger.info(
			"room mode: returning %s items for user %s: %s",
			len(items),
			auth_user.id,
			[str(item.user_id) for item in items],
		)
		return NearbyResponse(items=items, cursor=None)

	# Campus mode: Directory from DB, same campus only
	elif query.mode == "campus":
		pool = await get_pool()
		user_row = await pool.fetchrow("SELECT lat, lon FROM users WHERE id = $1", auth_user.id)
		lat = user_row["lat"] if user_row else None
		lon = user_row["lon"] if user_row else None

		live = await _fetch_directory_candidates(campus_id, auth_user_id, lat, lon, limit=query.limit)
		user_ids = [uid for uid, _ in live]
		distances = {uid: dist for uid, dist in live}

		profiles = await _load_user_lite(user_ids)
		friends_map = await load_friendship_flags(auth_user.id, user_ids)
		privacy_map = await load_privacy(user_ids)
		blocks_map = await load_blocks(auth_user.id, user_ids)
		
		items = []
		for uid in user_ids:
			uid_str = str(uid)
			if blocks_map.get(uid_str):
				continue
			profile = profiles.get(uid_str)
			if not profile:
				continue
			
			is_friend = bool(friends_map.get(uid_str))
			privacy_settings = privacy_map.get(uid_str, PrivacySettings())
			if not privacy_settings.allows_visibility(is_friend):
				continue

			distance = distances.get(uid, 0.0)
			
			items.append(
				NearbyUser(
					user_id=UUID(uid_str),
					display_name=str(profile["display_name"]),
					handle=str(profile["handle"]),
					avatar_url=str(profile["avatar_url"]) if profile.get("avatar_url") else None,
					campus_name=profile.get("campus_name"),
					major=profile.get("major"),
					graduation_year=profile.get("graduation_year"),
					distance_m=int(distance) if distance > 0 else None,
					is_friend=is_friend,
					bio=profile.get("bio"),
					passions=profile.get("passions") or [],
					gallery=profile.get("gallery") or [],
					courses=profile.get("courses") or [],
					social_links=profile.get("social_links") or {},
					banner_url=profile.get("banner_url"),
					ten_year_vision=profile.get("ten_year_vision"),
					is_university_verified=bool(profile.get("is_university_verified", False)),
					gender=profile.get("gender"),
					birthday=profile.get("birthday"),
					hometown=profile.get("hometown"),
					languages=profile.get("languages") or [],
					relationship_status=profile.get("relationship_status"),
					sexual_orientation=profile.get("sexual_orientation"),
					looking_for=profile.get("looking_for") or [],
					height=profile.get("height"),
					lifestyle=profile.get("lifestyle") or {},
					profile_prompts=profile.get("profile_prompts") or [],
				)
			)
		return NearbyResponse(items=items)

	# City mode: Directory from DB, all campuses
	elif query.mode == "city":
		pool = await get_pool()
		user_row = await pool.fetchrow("SELECT lat, lon FROM users WHERE id = $1", auth_user.id)
		lat = user_row["lat"] if user_row else None
		lon = user_row["lon"] if user_row else None

		# City mode: Exclude the viewer's own campus to show students from other universities.
		live = await _fetch_directory_candidates(
			None, auth_user_id, lat, lon, limit=query.limit, exclude_campus_id=campus_id
		)
		user_ids = [uid for uid, _ in live]
		distances = {uid: dist for uid, dist in live}

		profiles = await _load_user_lite(user_ids)
		friends_map = await load_friendship_flags(auth_user.id, user_ids)
		privacy_map = await load_privacy(user_ids)
		blocks_map = await load_blocks(auth_user.id, user_ids)

		items = []
		for uid in user_ids:
			uid_str = str(uid)
			if blocks_map.get(uid_str):
				continue
			profile = profiles.get(uid_str)
			if not profile:
				continue
			
			is_friend = bool(friends_map.get(uid_str))
			privacy_settings = privacy_map.get(uid_str, PrivacySettings())
			if not privacy_settings.allows_visibility(is_friend):
				continue

			distance = distances.get(uid, 0.0)

			items.append(
				NearbyUser(
					user_id=UUID(uid_str),
					display_name=str(profile["display_name"]),
					handle=str(profile["handle"]),
					avatar_url=str(profile["avatar_url"]) if profile.get("avatar_url") else None,
					campus_name=profile.get("campus_name"),
					major=profile.get("major"),
					graduation_year=profile.get("graduation_year"),
					distance_m=int(distance) if distance > 0 else None,
					is_friend=is_friend,
					bio=profile.get("bio"),
					passions=profile.get("passions") or [],
					gallery=profile.get("gallery") or [],
					courses=profile.get("courses") or [],
					social_links=profile.get("social_links") or {},
					banner_url=profile.get("banner_url"),
					ten_year_vision=profile.get("ten_year_vision"),
					is_university_verified=bool(profile.get("is_university_verified", False)),
					gender=profile.get("gender"),
					birthday=profile.get("birthday"),
					hometown=profile.get("hometown"),
					languages=profile.get("languages") or [],
					relationship_status=profile.get("relationship_status"),
					sexual_orientation=profile.get("sexual_orientation"),
					looking_for=profile.get("looking_for") or [],
					height=profile.get("height"),
					lifestyle=profile.get("lifestyle") or {},
					profile_prompts=profile.get("profile_prompts") or [],
				)
			)
		return NearbyResponse(items=items, cursor=None)

	# Fallback: legacy behavior (shouldn't reach here with new mode param)
	# For City mode (global scope), show all users from all campuses
	if query.scope == "global":
		campus_id = None

	# If radius > 50m or global scope, switch to Directory Mode (DB query)
	if query.radius_m > 50 or query.scope == "global":
		pool = await get_pool()
		user_row = await pool.fetchrow("SELECT lat, lon FROM users WHERE id = $1", auth_user.id)
		lat = user_row["lat"] if user_row else None
		lon = user_row["lon"] if user_row else None

		live = await _fetch_directory_candidates(campus_id, auth_user.id, lat, lon, limit=query.limit)
		
		profiles = await _load_user_lite([uid for uid, _ in live])
		
		items = []
		for uid, distance in live:
			profile = profiles.get(uid)
			if not profile:
				continue
			items.append(
				NearbyUser(
					user_id=UUID(uid),
					display_name=str(profile["display_name"]),
					handle=str(profile["handle"]),
					avatar_url=str(profile["avatar_url"]) if profile["avatar_url"] else None,
					major=str(profile["major"]) if profile["major"] else None,
					bio=str(profile["bio"]) if profile["bio"] else None,
					graduation_year=int(profile["graduation_year"]) if profile["graduation_year"] else None,
					distance_m=int(distance) if distance > 0 else None,
					gallery=profile["gallery"],
					passions=profile["passions"],
					courses=profile.get("courses") or [],
					campus_name=profile.get("campus_name"),
					ten_year_vision=profile.get("ten_year_vision"),
					social_links=identity_schemas.SocialLinks(**(profile.get("social_links") or {})),
					banner_url=(profile.get("status") or {}).get("banner_url"),
					is_university_verified=profile.get("is_university_verified", False),
					gender=profile.get("gender"),
					birthday=profile.get("birthday"),
					hometown=profile.get("hometown"),
					languages=profile.get("languages") or [],
					relationship_status=profile.get("relationship_status"),
					sexual_orientation=profile.get("sexual_orientation"),
					looking_for=profile.get("looking_for") or [],
					height=profile.get("height"),
					lifestyle=profile.get("lifestyle") or {},
					profile_prompts=profile.get("profile_prompts") or [],
				)
			)
		return NearbyResponse(items=items, cursor=None)


	# Otherwise, use existing Proximity Mode (Redis)
	presence_key = f"presence:{auth_user.id}"
	user_presence = await redis_client.hgetall(presence_key)
	if not user_presence:
		# No presence for the requesting user: signal caller to show empty state
		# (API layer converts this to HTTP 400 'presence not found').
		raise LookupError("presence_not_found")
	# Prefer the campus recorded by the latest presence heartbeat to avoid
	# any mismatch between request/auth campus and the actual geo set used.
	presence_campus = user_presence.get("campus_id")
	if presence_campus:
		campus_id = str(presence_campus)
	lon_user = float(user_presence.get("lon"))
	lat_user = float(user_presence.get("lat"))

	geo_key = f"geo:presence:{campus_id}"
	# For very tight radii (10m), expand the effective search radius slightly to
	# compensate for GPS jitter/accuracy so the 10m option is useful.
	effective_radius = query.radius_m
	if query.radius_m <= 10:
		effective_radius = max(query.radius_m, int(settings.proximity_min_search_radius_10m))

	live = await _fetch_live_candidates(
		geo_key, auth_user.id, radius=effective_radius, center=(lon_user, lat_user)
	)
	# Elevate to WARNING to avoid info-log sampling hiding diagnostics in dev
	logger.warning(
		"nearby query campus=%s radius=%s effective_radius=%s center=(%s,%s) candidates=%s",
		campus_id,
		query.radius_m,
		effective_radius,
		lon_user,
		lat_user,
		len(live),
	)

	user_ids = [uid for uid, _ in live]
	privacy_map = await load_privacy(user_ids)
	friends_map = await load_friendship_flags(auth_user.id, user_ids)
	blocks_map = await load_blocks(auth_user.id, user_ids)

	filtered: List[Tuple[str, float, PrivacySettings, bool]] = []
	for uid, distance_m in live:
		if blocks_map.get(uid):
			if logger.isEnabledFor(logging.DEBUG):
				logger.debug("nearby skip uid=%s reason=blocked", uid)
			continue
		privacy_settings = privacy_map.get(uid, PrivacySettings())
		is_friend = bool(friends_map.get(uid))
		if query.filter == "friends" and not is_friend:
			if logger.isEnabledFor(logging.DEBUG):
				logger.debug("nearby skip uid=%s reason=not_friend", uid)
			continue
		if not privacy_settings.allows_visibility(is_friend):
			if logger.isEnabledFor(logging.DEBUG):
				logger.debug("nearby skip uid=%s reason=privacy", uid)
			continue
		filtered.append((uid, distance_m, privacy_settings, is_friend))

	logger.warning(
		"nearby filtered campus=%s radius=%s count=%s ids=%s",
		campus_id,
		query.radius_m,
		len(filtered),
		[uid for uid, *_ in filtered],
	)

	start_idx = 0
	if query.cursor:
		try:
			last_uid, last_dist_mm = _decode_cursor(query.cursor)
			for idx, (uid, distance_m, *_rest) in enumerate(filtered):
				dist_mm = int(distance_m * 1000)
				if dist_mm > last_dist_mm or (dist_mm == last_dist_mm and uid > last_uid):
					start_idx = idx
					break
		except Exception:
			start_idx = 0

	limit = query.limit
	page = filtered[start_idx : start_idx + limit]

	profiles = await _load_user_lite([uid for uid, *_ in page])
	include_distance = not query.include or "distance" in query.include

	items: List[NearbyUser] = []
	for uid, distance_m, privacy_settings, is_friend in page:
		profile = profiles.get(uid)
		if not profile:
			continue
		# Skip soft-deleted or placeholder accounts (dev convenience)
		if profile.get("display_name") == "Deleted User" or str(profile.get("handle", "")).startswith("deleted-"):
			continue
		distance_value = None
		if include_distance:
			# Show more realistic proximity: decouple from UI radius.
			# Use at least 10m buckets (or the user's blur preference if higher).
			blur = max(int(privacy_settings.blur_distance_m or 0), 10)
			distance_value = round_up_to_bucket(distance_m, blur)
		items.append(
			NearbyUser(
				user_id=UUID(uid),
				display_name=profile["display_name"],
				handle=profile["handle"],
				avatar_url=profile.get("avatar_url"),
				major=profile.get("major"),
				distance_m=distance_value,
				is_friend=is_friend,
				bio=profile.get("bio") or None,
				graduation_year=profile.get("graduation_year"),
				gallery=profile.get("gallery", []),
				passions=profile.get("passions", []),
				courses=profile.get("courses") or [],
				ten_year_vision=profile.get("ten_year_vision"),
				is_university_verified=profile.get("is_university_verified", False),
			)
		)

	# Do not return demo items; an empty list is correct when nobody is nearby.

	next_cursor = None
	if len(filtered) > start_idx + limit and page:
		last_uid, last_distance, *_ = page[-1]
		next_cursor = _encode_cursor(last_uid, last_distance)

	await redis_client.xadd(
		"x:proximity.queries",
		{
			"user_id": auth_user.id,
			"campus_id": campus_id,
			"radius": query.radius_m,
			"effective_radius": effective_radius,
			"count": len(items),
		},
	)

	return NearbyResponse(items=items, cursor=next_cursor)
