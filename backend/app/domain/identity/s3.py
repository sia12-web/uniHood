"""In-memory S3 presign helpers used in tests and local dev."""

from __future__ import annotations

from typing import Iterable

import ulid

from app.domain.identity.schemas import PresignRequest, PresignResponse

DEFAULT_BUCKET_PREFIX = "avatars"
DEFAULT_BASE_URL = "https://cdn.divan.local"
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024
DEFAULT_EXPIRES = 600


class AvatarValidationError(ValueError):
	"""Raised when presign payloads are invalid."""


def _is_allowed_mime(mime: str) -> bool:
	return mime.lower() in ALLOWED_MIME_TYPES


def validate_presign(payload: PresignRequest, *, allowed: Iterable[str] | None = None) -> None:
	allowed_set = set(allowed or ALLOWED_MIME_TYPES)
	if payload.bytes <= 0:
		raise AvatarValidationError("size_invalid")
	if payload.bytes > MAX_AVATAR_BYTES:
		raise AvatarValidationError("size_exceeded")
	if payload.mime.lower() not in allowed_set:
		raise AvatarValidationError("mime_invalid")


def build_avatar_key(user_id: str) -> str:
	return f"{DEFAULT_BUCKET_PREFIX}/{user_id}/{ulid.new()}"


def presign_avatar(user_id: str, payload: PresignRequest) -> PresignResponse:
	validate_presign(payload)
	key = build_avatar_key(user_id)
	url = f"{DEFAULT_BASE_URL.rstrip('/')}/{key}"
	return PresignResponse(key=key, url=url, expires_s=DEFAULT_EXPIRES)


def build_gallery_key(user_id: str) -> str:
	return f"{DEFAULT_BUCKET_PREFIX}/{user_id}/gallery/{ulid.new()}"


def presign_gallery(user_id: str, payload: PresignRequest) -> PresignResponse:
	validate_presign(payload)
	key = build_gallery_key(user_id)
	url = f"{DEFAULT_BASE_URL.rstrip('/')}/{key}"
	return PresignResponse(key=key, url=url, expires_s=DEFAULT_EXPIRES)
