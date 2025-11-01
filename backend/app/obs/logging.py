"""Structured logging helpers for the observability package."""

from __future__ import annotations

import json
import logging
import random
from contextvars import ContextVar, Token
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.settings import settings

_REQUEST_ID: ContextVar[Optional[str]] = ContextVar("obs_request_id", default=None)
_ROUTE: ContextVar[Optional[str]] = ContextVar("obs_route", default=None)
_USER_ID: ContextVar[Optional[str]] = ContextVar("obs_user_id", default=None)
_CLIENT_IP: ContextVar[Optional[str]] = ContextVar("obs_client_ip", default=None)

_LOGGER_NAME = "divan"

try:  # pragma: no cover - otel optional
	from opentelemetry import trace as otel_trace
except Exception:  # pragma: no cover - optional dependency
	otel_trace = None  # type: ignore

_SENSITIVE_KEYWORDS = (
	"token",
	"secret",
	"authorization",
	"password",
	"email",
	"payload",
	"body",
	"geo",
	"latitude",
	"longitude",
	"lat",
	"lon",
)

_MAX_STRING_LENGTH = 256
_MAX_COLLECTION_ITEMS = 10


def bind_context(
	*,
	request_id: Optional[str] = None,
	route: Optional[str] = None,
	user_id: Optional[str] = None,
	client_ip: Optional[str] = None,
) -> Dict[str, Token]:
	"""Bind contextual fields for the current request and return reset tokens."""
	tokens: Dict[str, Token] = {}
	if request_id is not None:
		tokens["request_id"] = _REQUEST_ID.set(request_id)
	if route is not None:
		tokens["route"] = _ROUTE.set(route)
	if user_id is not None:
		tokens["user_id"] = _USER_ID.set(user_id)
	if client_ip is not None:
		tokens["client_ip"] = _CLIENT_IP.set(client_ip)
	return tokens


def reset_context(tokens: Dict[str, Token]) -> None:
	for key, token in tokens.items():
		if key == "request_id":
			_REQUEST_ID.reset(token)
		elif key == "route":
			_ROUTE.reset(token)
		elif key == "user_id":
			_USER_ID.reset(token)
		elif key == "client_ip":
			_CLIENT_IP.reset(token)


def clear_context() -> None:
	_REQUEST_ID.set(None)
	_ROUTE.set(None)
	_USER_ID.set(None)
	_CLIENT_IP.set(None)


def _truncate_collection(values: list[Any]) -> list[Any]:
	if len(values) <= _MAX_COLLECTION_ITEMS:
		return values
	trimmed = values[:_MAX_COLLECTION_ITEMS]
	trimmed.append("…")
	return trimmed


def _sanitize_value(value: Any) -> Any:
	if isinstance(value, str):
		return value if len(value) <= _MAX_STRING_LENGTH else f"{value[:_MAX_STRING_LENGTH]}…"
	if isinstance(value, dict):
		result: Dict[str, Any] = {}
		for idx, (key, nested) in enumerate(value.items()):
			if idx >= _MAX_COLLECTION_ITEMS:
				result["…"] = f"+{len(value) - _MAX_COLLECTION_ITEMS} keys"
				break
			result[key] = _sanitize_field(key, nested)
		return result
	if isinstance(value, (list, tuple, set)):
		items = [_sanitize_value(item) for item in list(value)]
		return _truncate_collection(items)
	return value


def _sanitize_field(key: str, value: Any) -> Any:
	lowered = key.lower()
	if any(keyword in lowered for keyword in _SENSITIVE_KEYWORDS):
		return "[redacted]"
	return _sanitize_value(value)


class JSONLogFormatter(logging.Formatter):
	"""Emit logs as JSON objects with structured fields."""

	def format(self, record: logging.LogRecord) -> str:  # noqa: A003 (match logging api)
		timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
		payload: Dict[str, object] = {
			"ts": timestamp,
			"level": record.levelname.lower(),
			"msg": record.getMessage(),
			"logger": record.name,
			"service": settings.service_name,
			"env": settings.environment,
			"commit": settings.git_commit,
		}
		request_id = _REQUEST_ID.get()
		if request_id:
			payload["request_id"] = request_id
		route = _ROUTE.get()
		if route:
			payload["route"] = route
		user_id = _USER_ID.get()
		if user_id:
			payload["user_id"] = user_id
		client_ip = _CLIENT_IP.get()
		if client_ip:
			payload["ip"] = client_ip
		if otel_trace is not None:
			try:
				span = otel_trace.get_current_span()
				context = span.get_span_context() if span else None
				if context and getattr(context, "is_valid", False):
					payload["trace_id"] = f"{context.trace_id:032x}"
					payload["span_id"] = f"{context.span_id:016x}"
			except Exception:  # pragma: no cover - defensive
				pass
		if record.exc_info:
			payload["exc_info"] = self.formatException(record.exc_info)
		if record.__dict__:
			extra = {
				k: v
				for k, v in record.__dict__.items()
				if k
				not in {
					"args",
					"msg",
					"levelname",
					"levelno",
					"pathname",
					"filename",
					"module",
					"exc_info",
					"exc_text",
					"stack_info",
					"lineno",
					"funcName",
					"created",
					"msecs",
					"relativeCreated",
					"thread",
					"threadName",
					"process",
					"processName",
					"message",
				}
			}
			if extra:
				for key, value in extra.items():
					payload[key] = _sanitize_field(key, value)
		return json.dumps(payload, separators=(",", ":"))


class InfoSamplingFilter(logging.Filter):
	"""Randomly sample info-level logs, keep warnings/errors."""

	def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
		if record.levelno > logging.INFO:
			return True
		if record.levelno < logging.INFO:
			return True
		rate = max(0.0, min(1.0, settings.obs_log_sampling_rate_info))
		if rate >= 1.0:
			return True
		return random.random() < rate


def configure_logging() -> logging.Logger:
	"""Configure root logger with JSON formatting and sampling."""
	root = logging.getLogger()
	root.handlers.clear()
	handler = logging.StreamHandler()
	handler.setFormatter(JSONLogFormatter())
	handler.addFilter(InfoSamplingFilter())
	root.addHandler(handler)
	root.setLevel(settings.obs_log_level)
	return logging.getLogger(_LOGGER_NAME)


def get_logger(name: Optional[str] = None) -> logging.Logger:
	return logging.getLogger(name or _LOGGER_NAME)
