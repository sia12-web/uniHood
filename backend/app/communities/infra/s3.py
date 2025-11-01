"""Simplified S3 presign helper for Phase 1."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Optional

from app.communities.domain.exceptions import ValidationError

_MAX_EXPIRES = 900  # 15 minutes


@dataclass(slots=True)
class PresignRequest:
	"""Input values from the API endpoint."""

	mime: str
	size_bytes: int
	purpose: str
	width: Optional[int] = None
	height: Optional[int] = None


@dataclass(slots=True)
class PresignResponse:
	key: str
	url: str
	fields: dict[str, str]
	expires_in: int = _MAX_EXPIRES


_ALLOWED_PURPOSES = {"group", "post", "comment"}


def _generate_key(user_id: str, purpose: str) -> str:
	rand_part = secrets.token_urlsafe(12)
	return f"communities/{purpose}/{user_id}/{rand_part}"


def presign_upload(user_id: str, request: PresignRequest) -> PresignResponse:
	"""Return a deterministic presign payload without relying on AWS SDK."""
	if request.purpose not in _ALLOWED_PURPOSES:
		raise ValidationError("invalid_purpose")
	if request.size_bytes < 1 or request.size_bytes > 104_857_600:
		raise ValidationError("size_out_of_bounds")
	key = _generate_key(user_id, request.purpose)
	# For Phase 1 we simulate a presigned URL. Clients treat it as opaque.
	url = f"https://s3.local/{key}"
	fields = {"Content-Type": request.mime, "Cache-Control": "max-age=31536000"}
	return PresignResponse(key=key, url=url, fields=fields)
