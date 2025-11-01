"""Attachment helpers for room messages."""

from __future__ import annotations

from typing import Tuple

import ulid

from app.domain.rooms.schemas import PresignRequest, PresignResponse, RoomMessageSendRequest

TEXT_MAX_LEN = 4000
IMAGE_MAX_BYTES = 8 * 1024 * 1024
FILE_MAX_BYTES = 25 * 1024 * 1024
DEFAULT_UPLOAD_BASE = "https://uploads.local"


class AttachmentValidationError(ValueError):
	"""Raised when attachment payloads are invalid."""


def _ensure_text_payload(request: RoomMessageSendRequest) -> None:
	if not request.content or not request.content.strip():
		raise AttachmentValidationError("text_required")
	if len(request.content) > TEXT_MAX_LEN:
		raise AttachmentValidationError("text_too_long")


def _ensure_media_payload(request: RoomMessageSendRequest) -> None:
	if not request.media_key:
		raise AttachmentValidationError("media_key_required")
	if not request.media_mime:
		raise AttachmentValidationError("media_mime_required")
	if request.media_bytes is None or request.media_bytes <= 0:
		raise AttachmentValidationError("media_bytes_required")
	if "/" not in request.media_mime:
		raise AttachmentValidationError("media_mime_invalid")
	limit = IMAGE_MAX_BYTES if request.kind == "image" else FILE_MAX_BYTES
	if request.media_bytes > limit:
		raise AttachmentValidationError("media_too_large")


def validate_message_payload(request: RoomMessageSendRequest) -> None:
	"""Validate message payload according to kind-specific rules."""
	if request.kind == "text":
		_ensure_text_payload(request)
	else:
		_ensure_media_payload(request)


def presign_upload(room_id: str, payload: PresignRequest, *, base_url: str = DEFAULT_UPLOAD_BASE) -> PresignResponse:
	"""Return a fake pre-signed URL for uploads in tests/dev."""
	if payload.kind not in {"image", "file"}:
		raise AttachmentValidationError("unsupported_kind")
	limit = IMAGE_MAX_BYTES if payload.kind == "image" else FILE_MAX_BYTES
	if payload.bytes > limit:
		raise AttachmentValidationError("media_too_large")
	key = f"rooms/{room_id}/{ulid.new()}"
	url = f"{base_url.rstrip('/')}/{key}"
	return PresignResponse(key=key, url=url, expires_s=900)


def media_limits() -> Tuple[int, int, int]:
	return TEXT_MAX_LEN, IMAGE_MAX_BYTES, FILE_MAX_BYTES
