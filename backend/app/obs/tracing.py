"""Distributed tracing setup (OpenTelemetry) for the backend."""

from __future__ import annotations

import logging
from typing import Optional, TYPE_CHECKING

from fastapi import FastAPI

from app.settings import settings

if TYPE_CHECKING:  # pragma: no cover - type hints only
	from opentelemetry.sdk.trace import TracerProvider as _TracerProvider
else:  # pragma: no cover - runtime fallback for typing alias
	_TracerProvider = object  # type: ignore[assignment]


try:  # pragma: no cover - imported conditionally
	from opentelemetry import trace
	from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
	from opentelemetry.sdk.resources import Resource
	from opentelemetry.sdk.trace import TracerProvider
	from opentelemetry.sdk.trace.export import BatchSpanProcessor
	from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
	from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
	from opentelemetry.instrumentation.requests import RequestsInstrumentor
	from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
	export_available = True
except Exception:  # pragma: no cover - gracefully handle missing deps
	export_available = False
	trace = None  # type: ignore

try:  # pragma: no cover - optional redis instrumentation
	from opentelemetry.instrumentation.redis import RedisInstrumentor  # type: ignore[import-not-found]
except Exception:  # pragma: no cover
	RedisInstrumentor = None  # type: ignore


LOGGER = logging.getLogger(__name__)
_instrumented = False


def init_tracing(app: FastAPI) -> Optional[TracerProvider]:
	"""Initialise OpenTelemetry tracing if enabled and dependencies present."""
	global _instrumented
	if not settings.obs_tracing_enabled:
		LOGGER.info("Tracing disabled via configuration")
		return None
	if not export_available or trace is None:
		LOGGER.warning("Tracing requested but OpenTelemetry dependencies missing")
		return None
	if settings.otel_exporter_otlp_endpoint is None:
		LOGGER.warning("Tracing requested but OTLP endpoint not configured")
		return None
	if _instrumented:
		return trace.get_tracer_provider()  # type: ignore[return-value]

	resource = Resource.create(
		{
			"service.name": settings.service_name,
			"service.version": settings.git_commit,
			"deployment.environment": settings.environment,
		}
	)
	provider = TracerProvider(resource=resource)
	exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint, insecure=True)
	processor = BatchSpanProcessor(exporter)
	provider.add_span_processor(processor)
	trace.set_tracer_provider(provider)

	FastAPIInstrumentor.instrument_app(app)
	try:
		HTTPXClientInstrumentor().instrument()
	except Exception:  # pragma: no cover - optional dependency
		LOGGER.debug("HTTPX instrumentation not available", exc_info=True)
	try:
		RequestsInstrumentor().instrument()
	except Exception:  # pragma: no cover
		LOGGER.debug("Requests instrumentation not available", exc_info=True)
	try:
		AsyncPGInstrumentor().instrument()
	except Exception:  # pragma: no cover
		LOGGER.debug("asyncpg instrumentation not available", exc_info=True)
	if RedisInstrumentor is not None:
		try:
			RedisInstrumentor().instrument()
		except Exception:  # pragma: no cover
			LOGGER.debug("Redis instrumentation not available", exc_info=True)

	_instrumented = True
	LOGGER.info("OpenTelemetry tracing initialised", extra={"endpoint": settings.otel_exporter_otlp_endpoint})
	return provider


def shutdown_tracing() -> None:
	if not export_available or trace is None:
		return
	provider = trace.get_tracer_provider()
	if hasattr(provider, "shutdown"):
		provider.shutdown()  # type: ignore[call-arg]
