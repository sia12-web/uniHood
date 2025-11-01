"""Profile management helpers for the identity subsystem."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import asyncpg

from app.domain.identity import models, policy, profile_public, s3, schemas
from app.domain.identity.service import ProfileNotFound
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


def _now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def _avatar_url(user: models.User) -> Optional[str]:
	if user.avatar_url:
		return user.avatar_url
	if user.avatar_key:
		return f"{s3.DEFAULT_BASE_URL.rstrip('/')}/{user.avatar_key}"
	return None


def _to_profile(user: models.User) -> schemas.ProfileOut:
	return schemas.ProfileOut(
		id=user.id,
		email=user.email,
		email_verified=user.email_verified,
		handle=user.handle,
		display_name=user.handle,
		bio=user.bio,
		avatar_url=_avatar_url(user),
		avatar_key=user.avatar_key,
		campus_id=user.campus_id,
		privacy=schemas.PrivacySettings(**(user.privacy or {})),
		status=schemas.StatusSettings(**(user.status or {})),
		major=user.major,
		graduation_year=user.graduation_year,
		passions=user.passions,
	)


async def _load_user(conn: asyncpg.Connection, user_id: str) -> models.User:
	row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
	if not row:
		raise ProfileNotFound()
	return models.User.from_record(row)


async def get_profile(user_id: str) -> schemas.ProfileOut:
	pool = await get_pool()
	async with pool.acquire() as conn:
		user = await _load_user(conn, user_id)
	return _to_profile(user)


async def patch_profile(auth_user: AuthenticatedUser, payload: schemas.ProfilePatch) -> schemas.ProfileOut:
	updates: dict[str, object] = {}
	patch_data = payload.model_dump(exclude_unset=True)
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

	policy.validate_profile_patch(updates)
	if "handle" in updates:
		policy.guard_handle_format(updates["handle"])

	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user = await _load_user(conn, auth_user.id)
			if "handle" in updates and updates["handle"] != user.handle:
				handle_owner = await conn.fetchrow("SELECT id FROM users WHERE handle = $1", updates["handle"])
				if handle_owner and str(handle_owner["id"]) != str(user.id):
					raise policy.HandleConflict("handle_taken")
			for key, value in updates.items():
				setattr(user, key, value)
			user.display_name = user.handle
			user.status["updated_at"] = user.status.get("updated_at") or _now_iso()
			await conn.execute(
				"""
				UPDATE users
				SET handle = $1,
					display_name = $2,
					bio = $3,
					privacy = $4,
					status = $5,
					major = $6,
					graduation_year = $7,
					passions = $8,
					updated_at = NOW()
				WHERE id = $9
				""",
				user.handle,
				user.handle,
				user.bio,
				user.privacy,
				user.status,
				user.major,
				user.graduation_year,
				user.passions,
				auth_user.id,
			)
	profile = _to_profile(user)
	obs_metrics.inc_profile_update()
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return profile


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
			user = await _load_user(conn, auth_user.id)
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
	profile = _to_profile(user)
	obs_metrics.inc_avatar_upload()
	await profile_public.rebuild_public_profile(auth_user.id, viewer_scope="everyone", force=True)
	return profile
