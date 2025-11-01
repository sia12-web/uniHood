"""Custom exceptions for communities services."""

from __future__ import annotations

from fastapi import status

if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT"):
	_HTTP_422 = status.HTTP_422_UNPROCESSABLE_CONTENT
else:  # pragma: no cover - fallback for older Starlette builds
	_HTTP_422 = status.HTTP_422_UNPROCESSABLE_ENTITY


class CommunityError(Exception):
	"""Base class for community related errors."""

	status_code: int = status.HTTP_400_BAD_REQUEST
	detail: str = "community_error"

	def __init__(self, detail: str | None = None) -> None:
		super().__init__(detail or self.detail)
		if detail:
			self.detail = detail


class NotFoundError(CommunityError):
	"""Thrown when a resource is not visible or missing."""

	status_code = status.HTTP_404_NOT_FOUND
	detail = "not_found"


class ForbiddenError(CommunityError):
	"""Raised when authorization fails."""

	status_code = status.HTTP_403_FORBIDDEN
	detail = "forbidden"


class ConflictError(CommunityError):
	"""Raised for conflicting operations (e.g., duplicate reaction)."""

	status_code = status.HTTP_409_CONFLICT
	detail = "conflict"


class ValidationError(CommunityError):
	"""Raised for validation errors not covered by FastAPI schema validation."""

	status_code = _HTTP_422
	detail = "validation_error"


class IdempotencyConflict(ConflictError):
	"""Raised when an idempotency key is reused with a mismatched payload."""

	detail = "idempotency_conflict"
