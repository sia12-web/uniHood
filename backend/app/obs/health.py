"""Health check helpers for liveness, readiness, and startup probes."""

from __future__ import annotations

import asyncio
import logging
from time import perf_counter
from typing import Any, Dict, Tuple

from app.infra import postgres
from app.infra.redis import redis_client
from app.obs import metrics
from app.settings import settings

LOGGER = logging.getLogger(__name__)


async def _redis_status(timeout: float = 0.2) -> Dict[str, Any]:
	start = perf_counter()
	try:
		await asyncio.wait_for(redis_client.ping(), timeout=timeout)
		latency = perf_counter() - start
		metrics.mark_redis(True, latency_seconds=latency)
		return {"ok": True, "latency_ms": round(latency * 1000, 2)}
	except Exception as exc:  # pragma: no cover - depends on runtime
		metrics.mark_redis(False)
		LOGGER.warning("Redis readiness check failed", exc_info=True)
		return {"ok": False, "error": str(exc)}


async def _postgres_status(timeout: float = 0.3) -> Tuple[Dict[str, Any], Any]:
	try:
		pool = await postgres.get_pool()
	except Exception as exc:  # pragma: no cover - connection bootstrap failure
		metrics.mark_postgres(False)
		LOGGER.warning("Postgres connection unavailable", exc_info=True)
		return ({"ok": False, "error": str(exc)}, None)

	start = perf_counter()
	try:
		async with pool.acquire() as conn:
			await asyncio.wait_for(conn.execute("SELECT 1"), timeout=timeout)
		latency = perf_counter() - start
		metrics.mark_postgres(True, latency_seconds=latency)
		return ({"ok": True, "latency_ms": round(latency * 1000, 2)}, pool)
	except Exception as exc:  # pragma: no cover - depends on runtime
		metrics.mark_postgres(False)
		LOGGER.warning("Postgres readiness query failed", exc_info=True)
		return ({"ok": False, "error": str(exc)}, pool)


async def _migration_status(pool, min_version: str) -> Dict[str, Any]:
	if pool is None:
		return {"ok": False, "error": "pool_unavailable"}
	try:
		async with pool.acquire() as conn:
			version = await conn.fetchval(
				"SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
			)
	except Exception as exc:  # pragma: no cover - optional table
		return {"ok": False, "error": str(exc)}
	if version is None:
		return {"ok": False, "error": "no_migrations"}
	current = str(version)
	return {"ok": current >= min_version, "version": current, "required": min_version}


async def liveness() -> Dict[str, Any]:
	return {"status": "ok"}


async def readiness() -> Tuple[int, Dict[str, Any]]:
	redis_state = await _redis_status()
	postgres_state, pool = await _postgres_status()
	migration_state = await _migration_status(pool, settings.health_min_migration)
	ok = redis_state.get("ok") and postgres_state.get("ok") and migration_state.get("ok")
	status_code = 200 if ok else 503
	return (
		status_code,
		{
			"status": "ok" if ok else "degraded",
			"checks": {
				"redis": redis_state,
				"postgres": postgres_state,
				"migrations": migration_state,
			},
		},
	)


async def startup() -> Tuple[int, Dict[str, Any]]:
	if settings.obs_tracing_enabled and not settings.otel_exporter_otlp_endpoint:
		return 503, {"status": "error", "error": "missing_otlp_endpoint"}
	return 200, {"status": "ok"}
