"""Attachment helpers for chat messages."""

from __future__ import annotations

from typing import Iterable, List, Mapping

import ulid

from .models import AttachmentMeta

_ALLOWED_PREFIXES = ("image/", "video/", "audio/", "application/pdf")


def _ensure_ulid(value: str | None) -> str:
	return value or str(ulid.new())


def normalize_attachments(items: Iterable[Mapping[str, object]] | None) -> List[AttachmentMeta]:
	"""Validate and normalise attachment payloads sent by clients.

	Each attachment may include:
	- attachment_id (optional ULID string)
	- media_type (required)
	- size_bytes (optional)
	- file_name (optional)
	- remote_url (optional, for already uploaded assets)
	"""

	normalized: List[AttachmentMeta] = []
	if not items:
		return normalized
	for entry in items:
		media_type = str(entry.get("media_type") or "").strip()
		if not media_type or not media_type.lower().startswith(_ALLOWED_PREFIXES):
			raise ValueError("unsupported media type")
		normalized.append(
			AttachmentMeta(
				attachment_id=_ensure_ulid(str(entry.get("attachment_id") or "")),
				media_type=media_type,
				size_bytes=int(entry["size_bytes"]) if entry.get("size_bytes") is not None else None,
				file_name=str(entry.get("file_name")) if entry.get("file_name") else None,
				remote_url=str(entry.get("remote_url")) if entry.get("remote_url") else None,
			)
		)
	return normalized
