"""Custom exceptions for communities search operations."""

from __future__ import annotations

class SearchError(Exception):
	"""Base class for communities search errors."""

	def __init__(self, detail: str, *, status_code: int = 400) -> None:
		super().__init__(detail)
		self.detail = detail
		self.status_code = status_code


class QueryValidationError(SearchError):
	"""Raised when a search query fails validation."""

	def __init__(self, detail: str, *, status_code: int = 422) -> None:
		super().__init__(detail, status_code=status_code)


class RateLimitError(SearchError):
	"""Raised when the caller exceeds the search rate limit."""

	def __init__(self) -> None:
		super().__init__("rate_limit", status_code=429)


class BackendError(SearchError):
	"""Raised when the search backend rejects a request."""

	def __init__(self, detail: str = "backend_error", *, status_code: int = 503) -> None:
		super().__init__(detail, status_code=status_code)
