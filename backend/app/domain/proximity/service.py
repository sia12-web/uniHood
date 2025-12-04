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
	# Cast parameter to uuid[] to avoid mismatched comparisons when passing string IDs
	rows = await pool.fetch(
		"""
		SELECT u.id, u.display_name, u.handle, u.avatar_url, u.major, u.bio, u.graduation_year, u.profile_gallery, u.passions,
		       ARRAY(SELECT course_code FROM user_courses WHERE user_id = u.id) as courses
		FROM users u
		WHERE u.id = ANY($1::uuid[])
		""",
		list({uid for uid in user_ids}),
	)
	return {
		str(row["id"]): {
			"display_name": row["display_name"],
			"handle": row["handle"],
			"avatar_url": row["avatar_url"],
			"major": row.get("major"),
			"bio": row.get("bio"),
			"graduation_year": row.get("graduation_year"),
			"gallery": [image.to_dict() for image in parse_profile_gallery(row.get("profile_gallery"))],
			"passions": json.loads(row["passions"]) if isinstance(row.get("passions"), str) else (row.get("passions") or []),
			"courses": row.get("courses") or [],
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
	live: List[PresenceTuple] = []
	# Treat entries as stale if the last heartbeat timestamp is too old,
	# so closing a client window quickly removes users from Nearby.
	stale_ms = int(settings.presence_stale_seconds * 1000)
	now_ms = int(time.time() * 1000)
	for member_id, distance in results:
		member_id = str(member_id)
		if member_id == auth_user_id:
			continue
		# Skip when key is missing (TTL == -2)
		ttl = await redis_client.ttl(f"presence:{member_id}")
		if ttl == -2:
			continue
		# Also skip when the last heartbeat is older than the stale threshold
		ts_raw = await redis_client.hget(f"presence:{member_id}", "ts")
		try:
			if not ts_raw:
				continue
			ts_ms = int(ts_raw)
			if now_ms - ts_ms > stale_ms:
				continue
		except Exception:
			# If we cannot parse ts, err on the side of not showing the user
			continue
		live.append((member_id, float(distance)))
	return live


async def _fetch_directory_candidates(
	campus_id: Optional[str], 
	auth_user_id: str, 
	lat: Optional[float], 
	lon: Optional[float], 
	limit: int, 
	offset: int = 0
) -> List[PresenceTuple]:
	pool = await get_pool()
	
	if lat is None or lon is None:
		# Fallback: return users ordered by creation date if we don't know where the user is
		if campus_id:
			rows = await pool.fetch(
				"""
				SELECT id FROM users u
				WHERE campus_id = $1 AND id != $2 AND deleted_at IS NULL
				AND EXISTS (
					SELECT 1 FROM sessions s
					WHERE s.user_id = u.id
					AND s.revoked = FALSE
					AND s.last_used_at > NOW() - INTERVAL '24 hours'
				)
				ORDER BY created_at DESC
				LIMIT $3 OFFSET $4
				""",
				campus_id,
				auth_user_id,
				limit,
				offset,
			)
		else:
			rows = await pool.fetch(
				"""
				SELECT id FROM users u
				WHERE id != $1 AND deleted_at IS NULL
				AND EXISTS (
					SELECT 1 FROM sessions s
					WHERE s.user_id = u.id
					AND s.revoked = FALSE
					AND s.last_used_at > NOW() - INTERVAL '24 hours'
				)
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
	if campus_id:
		rows = await pool.fetch(
			"""
			SELECT id, 
				(6371000 * acos(LEAST(1.0, GREATEST(-1.0, 
					cos(radians($3)) * cos(radians(lat)) * cos(radians(lon) - radians($4)) + 
					sin(radians($3)) * sin(radians(lat))
				)))) AS distance
			FROM users u
			WHERE campus_id = $1 AND id != $2 AND deleted_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL
			AND EXISTS (
				SELECT 1 FROM sessions s
				WHERE s.user_id = u.id
				AND s.revoked = FALSE
				AND s.last_used_at > NOW() - INTERVAL '24 hours'
			)
			ORDER BY distance ASC
			LIMIT $5 OFFSET $6
			""",
			campus_id,
			auth_user_id,
			lat,
			lon,
			limit,
			offset,
		)
	else:
		rows = await pool.fetch(
			"""
			SELECT id, 
				(6371000 * acos(LEAST(1.0, GREATEST(-1.0, 
					cos(radians($2)) * cos(radians(lat)) * cos(radians(lon) - radians($3)) + 
					sin(radians($2)) * sin(radians(lat))
				)))) AS distance
			FROM users u
			WHERE id != $1 AND deleted_at IS NULL AND lat IS NOT NULL AND lon IS NOT NULL
			AND EXISTS (
				SELECT 1 FROM sessions s
				WHERE s.user_id = u.id
				AND s.revoked = FALSE
				AND s.last_used_at > NOW() - INTERVAL '24 hours'
			)
			ORDER BY distance ASC
			LIMIT $4 OFFSET $5
			""",
			auth_user_id,
			lat,
			lon,
			limit,
			offset,
		)
	return [(str(row["id"]), float(row["distance"])) for row in rows]


async def get_nearby(auth_user: AuthenticatedUser, query: NearbyQuery) -> NearbyResponse:
	limit = 300 if settings.is_dev() else 30
	if not await allow("nearby", auth_user.id, limit=limit):
		raise RateLimitExceeded("nearby")

	campus_id = str(query.campus_id or auth_user.campus_id)
	if query.scope == "global":
		campus_id = None

	# If radius > 50m or global scope, switch to Directory Mode (DB query)
	if query.radius_m > 50 or query.scope == "global":
		# Fetch user location from DB
		pool = await get_pool()
		user_row = await pool.fetchrow("SELECT lat, lon FROM users WHERE id = $1", auth_user.id)
		lat = user_row["lat"] if user_row else None
		lon = user_row["lon"] if user_row else None

		# Simple pagination using cursor as offset if needed, or just limit
		# For now, we'll just fetch the top N users
		live = await _fetch_directory_candidates(campus_id, auth_user.id, lat, lon, limit=query.limit)
		
		# Load profile data
		profiles = await _load_user_lite([uid for uid, _ in live])
		
		# Build response
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
					gallery=profile["gallery"], # type: ignore
					passions=profile["passions"], # type: ignore
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
