"""Profile management helpers for the identity subsystem."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import asyncpg

from app.domain.identity import models, policy, profile_public, s3, schemas, courses as courses_service
from app.domain.identity.service import CampusNotFound, ProfileNotFound
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics
from app.settings import settings


logger = logging.getLogger(__name__)


MAX_GALLERY_ITEMS = 6
HANDLE_ALLOWED_RE = re.compile(r"[^a-z0-9_]+")

# Profile cache settings
_PROFILE_CACHE_TTL = 60  # seconds


async def _invalidate_profile_cache(user_id: str) -> None:
	"""Invalidate cached profile for a user."""
	from app.infra.redis import redis_client
	cache_key = f"profile:{user_id}"
	try:
		await redis_client.delete(cache_key)
	except Exception:
		logger.warning("Failed to invalidate profile cache", exc_info=True)


async def invalidate_profile_cache(user_id: str) -> None:
	"""Public helper to clear the cached profile for the given user."""
	await _invalidate_profile_cache(user_id)


def _now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def _avatar_url(user: models.User) -> Optional[str]:
	# Always build URL from avatar_key to use current DEFAULT_BASE_URL
	# This ensures the URL reflects the correct port/host in dev
	if user.avatar_key:
		return f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{user.avatar_key}"
	# Fallback to stored URL only if no key (legacy data)
	if user.avatar_url:
		return user.avatar_url
	return None


def _to_gallery(images: list[models.ProfileImage]) -> list[schemas.GalleryImage]:
	return [
		schemas.GalleryImage(
			key=item.key,
			url=(f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{item.key}" if item.key else item.url),
			uploaded_at=item.uploaded_at or None,
		)
		for item in images
	]


def _to_profile(user: models.User, courses: Optional[list[schemas.Course]] = None) -> schemas.ProfileOut:
	return schemas.ProfileOut(
		id=user.id,
		email=user.email,
		email_verified=user.email_verified,
		handle=user.handle,
		display_name=user.display_name,
		bio=user.bio,
		avatar_url=_avatar_url(user),
		avatar_key=user.avatar_key,
		campus_id=user.campus_id,
		privacy=schemas.PrivacySettings(**(user.privacy or {})),
		status=schemas.StatusSettings(**(user.status or {})),
		major=user.major,
		graduation_year=user.graduation_year,
		passions=user.passions,
		courses=courses or [],
		gallery=_to_gallery(user.profile_gallery),
		social_links=schemas.SocialLinks(**(user.social_links or {})),
		lat=user.lat,
		lon=user.lon,
		ten_year_vision=user.ten_year_vision,
		gender=user.gender,
		birthday=user.birthday.isoformat() if hasattr(user.birthday, "isoformat") else str(user.birthday) if user.birthday else None,
		hometown=user.hometown,
		languages=user.languages or [],
		relationship_status=user.relationship_status,
		sexual_orientation=user.sexual_orientation,
		looking_for=user.looking_for or [],
		height=user.height,
		lifestyle=user.lifestyle or {},
		profile_prompts=user.profile_prompts or [],
		reputation_score=user.reputation_score,
		review_count=user.review_count,
	)


def _normalise_handle_candidate(raw: str) -> str:
	text = (raw or "").strip().lower()
	text = text.replace(" ", "_")
	text = HANDLE_ALLOWED_RE.sub("", text)
	return text.strip("_")


def _derive_handle(auth_user: AuthenticatedUser) -> str:
	candidates = []
	if auth_user.handle:
		candidates.append(_normalise_handle_candidate(auth_user.handle))
	if auth_user.display_name:
		candidates.append(_normalise_handle_candidate(auth_user.display_name))
	from_id = _normalise_handle_candidate(str(auth_user.id).replace("-", ""))
	if from_id:
		candidates.append(from_id)
	candidates.append("demo")
	for candidate in candidates:
		if len(candidate) < 3:
			continue
		return candidate[:20]
	return "demo_user"


async def _bootstrap_user(
	conn: asyncpg.Connection,
	auth_user: AuthenticatedUser,
) -> models.User:
	"""Create a placeholder user in dev when synthetic auth references a missing record."""
	if settings.environment != "dev":
		raise ProfileNotFound()
	if not auth_user.campus_id:
		raise ProfileNotFound()
	campus_exists = await conn.fetchval("SELECT 1 FROM campuses WHERE id = $1", str(auth_user.campus_id))
	if not campus_exists:
		raise ProfileNotFound()
	base_handle = _derive_handle(auth_user)
	display = (auth_user.display_name or base_handle).strip() or base_handle
	if len(display) > 80:
		display = display[:80]
	handle = base_handle
	suffix = 0
	while True:
		policy.guard_handle_format(handle)
		try:
			await conn.execute(
				"""
				INSERT INTO users (
					id, email, email_verified, handle, display_name, bio, avatar_key,
					avatar_url, campus_id, privacy, status, password_hash
				)
				VALUES (
					$1, NULL, TRUE, $2, $3, '', NULL,
					NULL, $4,
					jsonb_build_object('visibility','everyone','ghost_mode',FALSE),
					jsonb_build_object('text','', 'emoji','', 'updated_at', NOW()),
					''
				)
				""",
				str(auth_user.id),
				handle,
				display,
				str(auth_user.campus_id),
			)
			break
		except asyncpg.UniqueViolationError as exc:  # type: ignore[attr-defined]
			detail = getattr(exc, "detail", "") or ""
			if "users_handle_key" in detail:
				suffix += 1
				remaining = max(3, 20 - len(str(suffix)))
				handle = f"{base_handle[:remaining]}{suffix}"
				continue
			raise

	row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
	if not row:
		raise ProfileNotFound()
	user = models.User.from_record(row)
	logger.info(
		"bootstrapped dev profile", extra={"user_id": auth_user.id, "handle": user.handle, "campus_id": str(auth_user.campus_id)}
	)
	try:
		await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	except Exception:  # pragma: no cover - dev bootstrap should continue
		logger.debug("Failed to rebuild public profile after bootstrap", exc_info=True)
	return user


async def _load_user(
	conn: asyncpg.Connection,
	user_id: str,
	*,
	auth_user: Optional[AuthenticatedUser] = None,
) -> models.User:
	row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
	if row:
		return models.User.from_record(row)
	if auth_user and auth_user.id == user_id:
		return await _bootstrap_user(conn, auth_user)
	raise ProfileNotFound()




async def _augment_with_xp(profile: schemas.ProfileOut, user_id: str) -> schemas.ProfileOut:
	try:
		from app.domain.xp import XPService
		stats = await XPService().get_user_stats(user_id)
		profile.xp = stats.total_xp
		profile.level = stats.current_level
		profile.level_label = stats.level_label
		profile.next_level_xp = stats.next_level_xp
	except Exception:
		# Don't break profile fetch if XP service fails
		logger.exception("Failed to augment profile with XP")
	return profile


async def get_profile(user_id: str, *, auth_user: Optional[AuthenticatedUser] = None) -> schemas.ProfileOut:
	"""Get profile with Redis caching for performance."""
	from app.infra.redis import redis_client
	
	cache_key = f"profile:{user_id}"
	
	profile: Optional[schemas.ProfileOut] = None
	
	# Try cache first
	cached = await redis_client.get(cache_key)
	if cached:
		try:
			data = json.loads(cached)
			profile = schemas.ProfileOut(**data)
		except (json.JSONDecodeError, Exception):
			# Invalid cache, continue to fetch from DB
			pass
	
	if not profile:
		# Fetch from database
		pool = await get_pool()
		async with pool.acquire() as conn:
			user = await _load_user(conn, user_id, auth_user=auth_user)
		courses = await courses_service.get_user_courses(user.id)
		profile = _to_profile(user, [schemas.Course(code=course.code, name=course.code) for course in courses])
		
		# Cache the result (WITHOUT XP if we want strictly static cache, but here we cache simple structure. 
		# XP overwrites anyway)
		try:
			cache_data = profile.model_dump_json()
			await redis_client.setex(cache_key, _PROFILE_CACHE_TTL, cache_data)
		except Exception:
			# Cache write failures shouldn't break the endpoint
			pass
	
	# Award daily login XP if this is the authenticated user fetching their OWN profile
	if auth_user and str(auth_user.id) == user_id:
		try:
			from app.domain.xp import XPService
			await XPService().award_daily_login(user_id)
		except Exception:
			logger.exception("Failed to award daily login XP")

	# Always fetch live XP
	return await _augment_with_xp(profile, user_id)


async def patch_profile(auth_user: AuthenticatedUser, payload: schemas.ProfilePatch) -> schemas.ProfileOut:
	updates: dict[str, object] = {}
	patch_data = payload.model_dump(exclude_unset=True)
	courses_to_set: Optional[list[str]] = None
	if "bio" in patch_data:
		updates["bio"] = (patch_data.get("bio") or "").strip()
	if "privacy" in patch_data and payload.privacy is not None:
		updates["privacy"] = payload.privacy.model_dump()
	if "status" in patch_data and payload.status is not None:
		status = payload.status.model_dump()
		status["updated_at"] = _now_iso()
		updates["status"] = status
	if "handle" in patch_data and payload.handle is not None:
		updates["handle"] = policy.normalise_handle(payload.handle)
	if "display_name" in patch_data:
		display = patch_data.get("display_name")
		updates["display_name"] = (display.strip() if isinstance(display, str) else None) or None
	if "major" in patch_data:
		major = patch_data.get("major")
		updates["major"] = (major.strip() if isinstance(major, str) else None) or None
	if "graduation_year" in patch_data:
		updates["graduation_year"] = patch_data.get("graduation_year")
	if "passions" in patch_data:
		raw_passions = patch_data.get("passions") or []
		cleaned: list[str] = []
		seen: set[str] = set()
		for entry in raw_passions:
			if not isinstance(entry, str):
				continue
			trimmed = entry.strip()
			if not trimmed:
				continue
			key = trimmed.casefold()
			if key in seen:
				continue
			seen.add(key)
			cleaned.append(trimmed)
		updates["passions"] = cleaned
	if "lat" in patch_data:
		updates["lat"] = patch_data.get("lat")
	if "lon" in patch_data:
		updates["lon"] = patch_data.get("lon")
	if "campus_id" in patch_data and payload.campus_id is not None:
		updates["campus_id"] = str(payload.campus_id)
	if "social_links" in patch_data and payload.social_links is not None:
		updates["social_links"] = payload.social_links.model_dump(exclude_unset=True)
	if "courses" in patch_data:
		raw_courses = patch_data.get("courses") or []
		seen_courses: set[str] = set()
		clean_courses: list[str] = []
		for entry in raw_courses:
			if not isinstance(entry, str):
				continue
			code = entry.strip()
			if not code:
				continue
			normalized = code.upper()
			if normalized in seen_courses:
				continue
			seen_courses.add(normalized)
			clean_courses.append(normalized)
		courses_to_set = clean_courses
	if "ten_year_vision" in patch_data:
		vision = patch_data.get("ten_year_vision")
		updates["ten_year_vision"] = (vision.strip() if isinstance(vision, str) else None) or None
	if "gender" in patch_data:
		updates["gender"] = patch_data.get("gender")
	if "birthday" in patch_data:
		val = patch_data.get("birthday")
		if val:
			try:
				from datetime import datetime
				if isinstance(val, str):
					updates["birthday"] = datetime.fromisoformat(val.replace("Z", "+00:00")).date()
				else:
					updates["birthday"] = val
			except Exception:
				updates["birthday"] = None
		else:
			updates["birthday"] = None
	if "hometown" in patch_data:
		val = patch_data.get("hometown")
		updates["hometown"] = (val.strip() if isinstance(val, str) else None) or None
	if "languages" in patch_data:
		updates["languages"] = patch_data.get("languages") or []
	if "relationship_status" in patch_data:
		updates["relationship_status"] = patch_data.get("relationship_status")
	if "sexual_orientation" in patch_data:
		updates["sexual_orientation"] = patch_data.get("sexual_orientation")
	if "looking_for" in patch_data:
		updates["looking_for"] = patch_data.get("looking_for") or []
	if "height" in patch_data:
		updates["height"] = patch_data.get("height")
	if "lifestyle" in patch_data:
		updates["lifestyle"] = patch_data.get("lifestyle") or {}
	if "profile_prompts" in patch_data:
		updates["profile_prompts"] = patch_data.get("profile_prompts") or []

	policy.validate_profile_patch(updates)
	if "handle" in updates:
		policy.guard_handle_format(updates["handle"])

	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			if "campus_id" in updates:
				exists = await conn.fetchval("SELECT 1 FROM campuses WHERE id = $1", updates["campus_id"])
				if not exists:
					raise CampusNotFound()

			user = await _load_user(conn, auth_user.id, auth_user=auth_user)
			if "handle" in updates and updates["handle"] != user.handle:
				handle_owner = await conn.fetchrow("SELECT id FROM users WHERE handle = $1", updates["handle"])
				if handle_owner and str(handle_owner["id"]) != str(user.id):
					raise policy.HandleConflict("handle_taken")
			for key, value in updates.items():
				setattr(user, key, value)
			if "display_name" in patch_data:
				user.display_name = (patch_data.get("display_name") or "").strip() or user.display_name
			user.status["updated_at"] = user.status.get("updated_at") or _now_iso()
			privacy_payload = json.dumps(user.privacy or {})
			status_payload = json.dumps(user.status or {})
			passions_payload = json.dumps(user.passions or [])
			social_links_payload = json.dumps(user.social_links or {})
			await conn.execute(
				"""
				UPDATE users
				SET handle = $1,
					display_name = $2,
					bio = $3,
					privacy = $4::jsonb,
					status = $5::jsonb,
					major = $6,
					graduation_year = $7,
					passions = $8::jsonb,
					lat = $9,
					lon = $10,
					campus_id = $12,
					social_links = $13::jsonb,
					ten_year_vision = $14,
					gender = $15,
					birthday = $16,
					hometown = $17,
					languages = $18,
					relationship_status = $19,
					sexual_orientation = $20,
					looking_for = $21,
					height = $22,
					lifestyle = $23::jsonb,
					profile_prompts = $24::jsonb,
					updated_at = NOW()
				WHERE id = $11
				""",
				user.handle,
				user.display_name,
				user.bio,
				privacy_payload,
				status_payload,
				user.major,
				user.graduation_year,
				passions_payload,
				user.lat,
				user.lon,
				auth_user.id,
				str(user.campus_id),
				social_links_payload,
				user.ten_year_vision,
				user.gender,
				user.birthday,
				user.hometown,
				user.languages or [],
				user.relationship_status,
				user.sexual_orientation,
				user.looking_for or [],
				user.height,
				json.dumps(user.lifestyle or {}),
				json.dumps(user.profile_prompts or []),
			)
			# Persist courses after the user row update (default visibility: everyone)
			if courses_to_set is not None:
				await courses_service.set_user_courses(user.id, courses_to_set, "everyone")
	
	# Invalidate profile cache after update
	await _invalidate_profile_cache(str(auth_user.id))
	
	courses_for_profile = await courses_service.get_user_courses(user.id)
	profile = _to_profile(user, [schemas.Course(code=row.code, name=row.code) for row in courses_for_profile])
	try:
		obs_metrics.inc_profile_update()
	except Exception:  # pragma: no cover - metrics backend failures should not block profile saves
		logger.warning("Failed to record profile update metric", exc_info=True)
	try:
		from app.domain.xp import XPService
		from app.domain.xp.models import XPAction
		from app.infra.redis import redis_client
		
		# Only award XP once for profile completion
		# Check if user has already received profile completion bonus
		profile_xp_key = f"profile_xp_awarded:{auth_user.id}"
		already_awarded = await redis_client.get(profile_xp_key)
		
		if not already_awarded:
			# Award XP for first-time profile completion
			await XPService().award_xp(auth_user.id, XPAction.PROFILE_UPDATE)
			# Set flag that never expires (permanent one-time award)
			await redis_client.set(profile_xp_key, "1")
	except Exception:
		logger.warning("Failed to award profile update XP", exc_info=True)

	try:
		await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	except Exception:  # pragma: no cover - cache rebuild should not block profile saves
		logger.warning("Failed to rebuild public profile", exc_info=True)
	return await _augment_with_xp(profile, str(auth_user.id))


async def presign_avatar(auth_user: AuthenticatedUser, payload: schemas.PresignRequest) -> schemas.PresignResponse:
	return s3.presign_avatar(auth_user.id, payload)


async def commit_avatar(auth_user: AuthenticatedUser, request: schemas.AvatarCommitRequest) -> schemas.ProfileOut:
	key = request.key
	if not key.startswith(f"{s3.DEFAULT_BUCKET_PREFIX}/{auth_user.id}/"):
		raise policy.IdentityPolicyError("avatar_key_invalid")
	url = f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{key}"
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user = await _load_user(conn, auth_user.id, auth_user=auth_user)
			
			await conn.execute(
				"""
				UPDATE users
				SET avatar_key = $1,
					avatar_url = $2,
					updated_at = NOW()
				WHERE id = $3
				""",
				key,
				url,
				auth_user.id,
			)
			user.avatar_key = key
			user.avatar_url = url
	
	# Invalidate profile cache after avatar change
	await _invalidate_profile_cache(str(auth_user.id))
	
	courses_for_profile = await courses_service.get_user_courses(user.id)
	profile = _to_profile(user, [schemas.Course(code=row.code, name=row.code) for row in courses_for_profile])
	obs_metrics.inc_avatar_upload()
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return await _augment_with_xp(profile, str(auth_user.id))


async def presign_gallery(auth_user: AuthenticatedUser, payload: schemas.PresignRequest) -> schemas.PresignResponse:
	return s3.presign_gallery(auth_user.id, payload)


def _serialize_gallery(images: list[models.ProfileImage]) -> str:
	return json.dumps([image.to_dict() for image in images])


async def commit_gallery(auth_user: AuthenticatedUser, request: schemas.GalleryCommitRequest) -> schemas.ProfileOut:
	key = request.key
	if not key.startswith(f"{s3.DEFAULT_BUCKET_PREFIX}/{auth_user.id}/"):
		raise policy.IdentityPolicyError("avatar_key_invalid")
	url = f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{key}"
	entry = models.ProfileImage(key=key, url=url, uploaded_at=_now_iso())
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user = await _load_user(conn, auth_user.id, auth_user=auth_user)
			gallery = [image for image in user.profile_gallery if image.key != key]
			gallery.insert(0, entry)
			trimmed = gallery[:MAX_GALLERY_ITEMS]
			await conn.execute(
				"""
				UPDATE users
				SET profile_gallery = $1::jsonb,
					updated_at = NOW()
				WHERE id = $2
				""",
				_serialize_gallery(trimmed),
				auth_user.id,
			)
			user.profile_gallery = trimmed
	
	# Invalidate profile cache after gallery change
	await _invalidate_profile_cache(str(auth_user.id))
	
	courses_for_profile = await courses_service.get_user_courses(user.id)
	profile = _to_profile(user, [schemas.Course(code=row.code, name=row.code) for row in courses_for_profile])
	obs_metrics.inc_profile_update()
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return await _augment_with_xp(profile, str(auth_user.id))


async def remove_gallery_image(auth_user: AuthenticatedUser, request: schemas.GalleryRemoveRequest) -> schemas.ProfileOut:
	key = request.key
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user = await _load_user(conn, auth_user.id, auth_user=auth_user)
			gallery = [image for image in user.profile_gallery if image.key != key]
			if len(gallery) == len(user.profile_gallery):
				return await _augment_with_xp(_to_profile(user), str(auth_user.id))
			await conn.execute(
				"""
				UPDATE users
				SET profile_gallery = $1::jsonb,
					updated_at = NOW()
				WHERE id = $2
				""",
				_serialize_gallery(gallery),
				auth_user.id,
			)
			user.profile_gallery = gallery
	
	# Invalidate profile cache after gallery removal
	await _invalidate_profile_cache(str(auth_user.id))
	
	courses_for_profile = await courses_service.get_user_courses(user.id)
	profile = _to_profile(user, [schemas.Course(code=row.code, name=row.code) for row in courses_for_profile])
	obs_metrics.inc_profile_update()
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return await _augment_with_xp(profile, str(auth_user.id))


async def reorder_photos(auth_user: AuthenticatedUser, request: schemas.PhotosSortRequest) -> schemas.ProfileOut:
	keys = request.keys
	if not keys:
		raise policy.IdentityPolicyError("no_keys_provided")
	
	# Validate prefix for all keys
	prefix = f"{s3.DEFAULT_BUCKET_PREFIX}/{auth_user.id}/"
	for key in keys:
		if not key.startswith(prefix):
			raise policy.IdentityPolicyError("invalid_photo_key")

	new_avatar_key = keys[0]
	new_gallery_keys = keys[1:]

	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user = await _load_user(conn, auth_user.id, auth_user=auth_user)
			
			# Map existing to preserve metadata if any
			existing = {img.key: img for img in user.profile_gallery}
			if user.avatar_key:
				existing[user.avatar_key] = models.ProfileImage(key=user.avatar_key, url=user.avatar_url)

			reordered_gallery = []
			for k in new_gallery_keys:
				if k in existing:
					reordered_gallery.append(existing[k])
				else:
					url = f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{k}"
					reordered_gallery.append(models.ProfileImage(key=k, url=url))

			new_avatar_url = f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{new_avatar_key}"
			
			await conn.execute(
				"""
				UPDATE users
				SET avatar_key = $1,
					avatar_url = $2,
					profile_gallery = $3::jsonb,
					updated_at = NOW()
				WHERE id = $4
				""",
				new_avatar_key,
				new_avatar_url,
				_serialize_gallery(reordered_gallery[:MAX_GALLERY_ITEMS]),
				auth_user.id,
			)
			user.avatar_key = new_avatar_key
			user.avatar_url = new_avatar_url
			user.profile_gallery = reordered_gallery[:MAX_GALLERY_ITEMS]

	await _invalidate_profile_cache(str(auth_user.id))
	courses_for_profile = await courses_service.get_user_courses(user.id)
	profile = _to_profile(user, [schemas.Course(code=row.code, name=row.code) for row in courses_for_profile])
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return await _augment_with_xp(profile, str(auth_user.id))
