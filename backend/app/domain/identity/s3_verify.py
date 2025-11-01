"""Presign helpers for verification document uploads."""

from __future__ import annotations

from typing import Iterable

import ulid

from app.domain.identity import schemas
from app.domain.identity import s3 as identity_s3

DEFAULT_BUCKET_PREFIX = "verify"
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_DOC_BYTES = 6 * 1024 * 1024
DEFAULT_EXPIRES = 600


class VerificationUploadError(ValueError):
	"""Raised when verification document uploads are invalid."""


def _is_allowed_mime(mime: str, allowed: Iterable[str]) -> bool:
	return mime.lower() in {item.lower() for item in allowed}


def validate_payload(payload: schemas.VerificationDocPresignRequest, *, allowed: Iterable[str] | None = None) -> None:
	allowed_set = set(allowed or ALLOWED_MIME_TYPES)
	if payload.bytes <= 0:
		raise VerificationUploadError("size_invalid")
	if payload.bytes > MAX_DOC_BYTES:
		raise VerificationUploadError("size_exceeded")
	if not _is_allowed_mime(payload.mime, allowed_set):
		raise VerificationUploadError("mime_invalid")


def build_document_key(user_id: str) -> str:
	return f"{DEFAULT_BUCKET_PREFIX}/{user_id}/{ulid.new()}"


def presign_document(user_id: str, payload: schemas.VerificationDocPresignRequest) -> schemas.PresignResponse:
	validate_payload(payload)
	key = build_document_key(user_id)
	url = f"{identity_s3.DEFAULT_BASE_URL.rstrip('/')}/{key}"
	return schemas.PresignResponse(key=key, url=url, expires_s=DEFAULT_EXPIRES)
