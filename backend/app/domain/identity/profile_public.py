"""Public profile projection, caching, and retrieval helpers."""

from __future__ import annotations

import json
from typing import Optional, Tuple

import asyncpg

from app.domain.identity import schemas, s3
from app.domain.identity.models import parse_profile_gallery
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

PUBLIC_PROFILE_CACHE_TTL = 5 * 60
PUBLIC_PROFILE_CACHE_PREFIX = "pp:v1"


class PublicProfileNotFound(LookupError):
	"""Raised when a public profile cannot be located."""


def _cache_key(handle: str) -> str:
	return f"{PUBLIC_PROFILE_CACHE_PREFIX}:{handle.lower()}"


def _avatar_url(avatar_url: Optional[str], avatar_key: Optional[str]) -> Optional[str]:
	if avatar_url:
		return avatar_url
	if avatar_key:
		return f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{avatar_key}"
	return None


def _gallery_payload(raw: object) -> list[schemas.GalleryImage]:
	return [
		schemas.GalleryImage(key=image.key, url=image.url, uploaded_at=image.uploaded_at or None)
		for image in parse_profile_gallery(raw)
	]


def _visibility_for_scope(scope: str) -> Tuple[str, ...]:
	if scope == "self":
		return ("everyone", "friends", "none")
	if scope == "friends":
		return ("everyone", "friends")
	return ("everyone",)


async def _resolve_scope(conn: asyncpg.Connection, user_id: str, viewer_id: Optional[str]) -> str:
	if viewer_id is None:
		return "everyone"
	if str(viewer_id) == str(user_id):
		return "self"
	row = await conn.fetchrow(
		"""
		SELECT 1
		FROM friendships
		WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
			AND status = 'accepted'
		LIMIT 1
		""",
		user_id,
		viewer_id,
	)
	return "friends" if row else "everyone"


async def _decode_cached(handle: str) -> Optional[schemas.PublicProfileOut]:
	cached = await redis_client.get(_cache_key(handle))
	if not cached:
		return None
	if isinstance(cached, bytes):
		cached = cached.decode("utf-8")
	try:
		payload = json.loads(cached)
	except json.JSONDecodeError:
		await redis_client.delete(_cache_key(handle))
		return None
	return schemas.PublicProfileOut(**payload)


async def _store_cache(handle: str, profile: schemas.PublicProfileOut) -> None:
	await redis_client.set(
		_cache_key(handle),
		json.dumps(profile.model_dump(mode="json")),
		ex=PUBLIC_PROFILE_CACHE_TTL,
	)


async def rebuild_public_profile(user_id: str, *, viewer_scope: str = "everyone", force: bool = False) -> None:
	"""Denormalise the public profile projection for the owner-facing scope."""
	_ = (viewer_scope, force)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user_row = await conn.fetchrow(
				"""
				SELECT id, handle, display_name, bio, campus_id, avatar_key, avatar_url
				FROM users
				WHERE id = $1
				FOR UPDATE
				""",
				user_id,
			)
			if not user_row:
				return
			education_row = await conn.fetchrow(
				"""
				SELECT program, year, visibility
				FROM education
				WHERE user_id = $1
				""",
				user_id,
			)
			program = ""
			year = None
			if education_row and education_row["visibility"] == "everyone":
				program = education_row["program"] or ""
				year = education_row["year"]
			interest_rows = await conn.fetch(
				"""
				SELECT i.slug
				FROM user_interests ui
				JOIN interests i ON i.id = ui.interest_id
				WHERE ui.user_id = $1 AND ui.visibility = 'everyone'
				ORDER BY ui.added_at DESC
				""",
				user_id,
			)
			interests = [row["slug"] for row in interest_rows]
			skill_rows = await conn.fetch(
				"""
				SELECT name, display, proficiency
				FROM user_skills
				WHERE user_id = $1 AND visibility = 'everyone'
				ORDER BY added_at DESC
				""",
				user_id,
			)
			skills = [
				{"name": row["name"], "display": row["display"], "proficiency": row["proficiency"]}
				for row in skill_rows
			]
			link_rows = await conn.fetch(
				"""
				SELECT kind, url
				FROM social_links
				WHERE user_id = $1 AND visibility = 'everyone'
				ORDER BY kind ASC
				""",
				user_id,
			)
			links = [{"kind": row["kind"], "url": row["url"]} for row in link_rows]
			await conn.execute(
				"""
				INSERT INTO public_profiles (user_id, handle, display_name, avatar_key, campus_id, bio, program, year, interests, skills, links, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, NOW())
				ON CONFLICT (user_id)
				DO UPDATE SET handle = EXCLUDED.handle,
					display_name = EXCLUDED.display_name,
					avatar_key = EXCLUDED.avatar_key,
					campus_id = EXCLUDED.campus_id,
					bio = EXCLUDED.bio,
					program = EXCLUDED.program,
					year = EXCLUDED.year,
					interests = EXCLUDED.interests,
					skills = EXCLUDED.skills,
					links = EXCLUDED.links,
					updated_at = NOW()
				""",
				user_id,
				user_row["handle"],
				user_row["handle"],
				user_row["avatar_key"],
				user_row["campus_id"],
				user_row["bio"],
				program,
				year,
				interests,
				json.dumps(skills),
				json.dumps(links),
			)
		handle = str(user_row["handle"])
	await redis_client.delete(_cache_key(handle))
	obs_metrics.inc_profiles_public_rebuild()


async def _load_projection(conn: asyncpg.Connection, handle: str, user_id: str) -> schemas.PublicProfileOut:
	row = await conn.fetchrow(
		"""
		SELECT p.user_id, p.handle, p.display_name, p.avatar_key, p.campus_id, p.bio,
			p.program, p.year, p.interests, p.skills, p.links, u.avatar_url, u.profile_gallery
		FROM public_profiles p
		JOIN users u ON u.id = p.user_id
		WHERE p.handle = $1
		""",
		handle,
	)
	if not row:
		await rebuild_public_profile(user_id, viewer_scope="everyone", force=True)
		row = await conn.fetchrow(
			"""
			SELECT p.user_id, p.handle, p.display_name, p.avatar_key, p.campus_id, p.bio,
				p.program, p.year, p.interests, p.skills, p.links, u.avatar_url, u.profile_gallery
			FROM public_profiles p
			JOIN users u ON u.id = p.user_id
			WHERE p.handle = $1
			""",
			handle,
		)
	if not row:
		raise PublicProfileNotFound(handle)
	skills_payload = row["skills"] or []
	if isinstance(skills_payload, str):
		skills_payload = json.loads(skills_payload or "[]")
	links_payload = row["links"] or []
	if isinstance(links_payload, str):
		links_payload = json.loads(links_payload or "[]")
	avatar = _avatar_url(row["avatar_url"], row["avatar_key"])
	def _safe_prof(value: object) -> int:
		try:
			prof = int(value)
		except (TypeError, ValueError):
			prof = 1
		return min(5, max(1, prof))

	return schemas.PublicProfileOut(
		user_id=row["user_id"],
		handle=row["handle"],
		display_name=row["display_name"],
		avatar_url=avatar,
		campus_id=row["campus_id"],
		bio=row["bio"] or "",
		program=row["program"] or None,
		year=row["year"],
		interests=list(row["interests"] or []),
		skills=[
			schemas.PublicSkill(display=item.get("display", ""), proficiency=_safe_prof(item.get("proficiency")))
			for item in skills_payload
		],
		links=[
			schemas.PublicLink(kind=item.get("kind", ""), url=item.get("url", ""))
			for item in links_payload
		],
		gallery=_gallery_payload(row.get("profile_gallery")),
	)


async def _load_live(conn: asyncpg.Connection, user_id: str, scope: str) -> schemas.PublicProfileOut:
	user_row = await conn.fetchrow(
		"""
		SELECT id, handle, display_name, bio, campus_id, avatar_key, avatar_url, profile_gallery
		FROM users
		WHERE id = $1
		""",
		user_id,
	)
	if not user_row:
		raise PublicProfileNotFound(user_id)
	allowed = _visibility_for_scope(scope)
	interests_rows = await conn.fetch(
		"""
		SELECT i.slug
		FROM user_interests ui
		JOIN interests i ON i.id = ui.interest_id
		WHERE ui.user_id = $1 AND ui.visibility = ANY($2::text[])
		ORDER BY ui.added_at DESC
		""",
		user_id,
		list(allowed),
	)
	interest_list = [row["slug"] for row in interests_rows]
	skill_rows = await conn.fetch(
		"""
		SELECT display, proficiency
		FROM user_skills
		WHERE user_id = $1 AND visibility = ANY($2::text[])
		ORDER BY added_at DESC
		""",
		user_id,
		list(allowed),
	)
	skill_list = [
		schemas.PublicSkill(display=row["display"], proficiency=row["proficiency"])
		for row in skill_rows
	]
	link_rows = await conn.fetch(
		"""
		SELECT kind, url
		FROM social_links
		WHERE user_id = $1 AND visibility = ANY($2::text[])
		ORDER BY kind ASC
		""",
		user_id,
		list(allowed),
	)
	link_list = [schemas.PublicLink(kind=row["kind"], url=row["url"]) for row in link_rows]
	education_row = await conn.fetchrow(
		"""
		SELECT program, year, visibility
		FROM education
		WHERE user_id = $1
		""",
		user_id,
	)
	program = None
	year = None
	if education_row and education_row["visibility"] in allowed:
		program = education_row["program"] or None
		year = education_row["year"]
	avatar = _avatar_url(user_row["avatar_url"], user_row["avatar_key"])
	return schemas.PublicProfileOut(
		user_id=user_row["id"],
		handle=user_row["handle"],
		display_name=user_row["display_name"],
		avatar_url=avatar,
		campus_id=user_row["campus_id"],
		bio=user_row["bio"] or "",
		program=program,
		year=year,
		interests=interest_list,
		skills=skill_list,
		links=link_list,
		gallery=_gallery_payload(user_row.get("profile_gallery")),
	)


async def get_public_profile(handle: str, *, viewer_id: Optional[str] = None) -> schemas.PublicProfileOut:
	"""Return a public profile view, applying field-level visibility."""
	handle_normalised = handle.lower()
	pool = await get_pool()
	async with pool.acquire() as conn:
		user_row = await conn.fetchrow("SELECT id FROM users WHERE handle = $1 AND deleted_at IS NULL", handle_normalised)
		if not user_row:
			raise PublicProfileNotFound(handle)
		user_id = str(user_row["id"])
		scope = await _resolve_scope(conn, user_id, viewer_id)
		if scope == "everyone":
			cached = await _decode_cached(handle_normalised)
			if cached:
				return cached
			profile = await _load_projection(conn, handle_normalised, user_id)
			await _store_cache(handle_normalised, profile)
			return profile
		return await _load_live(conn, user_id, scope)
