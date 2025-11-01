"""Error translation helpers for communities API."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.communities.domain import exceptions
from app.communities.search import exceptions as search_exceptions


def to_http_error(exc: Exception) -> HTTPException:
	"""Translate domain exceptions to FastAPI HTTP errors."""
	if isinstance(exc, exceptions.CommunityError):
		return HTTPException(status_code=exc.status_code, detail=exc.detail)
	if isinstance(exc, search_exceptions.SearchError):
		return HTTPException(status_code=exc.status_code, detail=exc.detail)
	return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
