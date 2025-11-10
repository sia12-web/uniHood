"""ASGI middleware for metrics, logging, and trace propagation."""

from __future__ import annotations

import time
from typing import Optional
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.obs import logging as obs_logging
from app.obs import metrics
from app.settings import settings

try:  # pragma: no cover - optional dependency
	from opentelemetry import trace
	_tracing_available = True
except Exception:  # pragma: no cover - otel optional
	_tracing_available = False
	trace = None  # type: ignore


def _route_template(request: Request) -> str:
	route = request.scope.get("route")
	if route and getattr(route, "path", None):
		return route.path  # type: ignore[return-value]
	return request.url.path


def _trace_headers() -> dict[str, str]:
	if not _tracing_available or trace is None:
		return {}
	span = trace.get_current_span()
	context = span.get_span_context() if span else None
	if not context or not getattr(context, "is_valid", False):
		return {}
	trace_id = f"{context.trace_id:032x}"
	span_id = f"{context.span_id:016x}"
	return {"traceparent": f"00-{trace_id}-{span_id}-01"}


class ObservabilityMiddleware(BaseHTTPMiddleware):
	"""Instrument requests with metrics, structured logs, and trace context."""

	def __init__(self, app, *, enabled: bool = True) -> None:
		super().__init__(app)
		self._enabled = enabled
		self._logger = obs_logging.get_logger("divan.http")

	async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
		if not settings.obs_enabled or not self._enabled:
			return await call_next(request)

		existing_request_id = getattr(request.state, "request_id", None)
		request_id = existing_request_id or request.headers.get("X-Request-Id") or str(uuid4())
		if not existing_request_id:
			setattr(request.state, "request_id", request_id)
		user_id = request.headers.get("X-User-Id")
		route_template = _route_template(request)
		client = request.client
		client_ip = client.host if client else None
		tokens = obs_logging.bind_context(
			request_id=request_id,
			route=route_template,
			user_id=user_id,
			client_ip=client_ip,
		)
		start = time.perf_counter()
		elapsed_seconds = 0.0
		status_code = 500
		response: Optional[Response] = None
		exc: Exception | None = None
		try:
			response = await call_next(request)
			status_code = response.status_code
		except Exception as err:
			self._logger.exception(
				"http_request_error",
				extra={"method": request.method, "path": request.url.path},
			)
			exc = err
		finally:
			elapsed_seconds = time.perf_counter() - start
			metrics.observe_request(route_template, request.method, status_code, elapsed_seconds)

		if response is None:
			response = Response(status_code=status_code)
		trace_headers = _trace_headers()
		if "X-Request-Id" not in response.headers:
			response.headers["X-Request-Id"] = request_id
		for key, value in trace_headers.items():
			response.headers.setdefault(key, value)

		extra: dict[str, object] = {
			"status": status_code,
			"method": request.method,
			"latency_ms": round(elapsed_seconds * 1000, 3),
			"route": route_template,
		}
		if client_ip:
			extra["ip"] = client_ip
		self._logger.info("http_request", extra=extra)
		obs_logging.reset_context(tokens)
		obs_logging.clear_context()
		if exc is not None:
			raise exc
		return response


def install(app, *, enabled: bool = True) -> None:
	app.add_middleware(ObservabilityMiddleware, enabled=enabled)
