"""Operations endpoints providing health checks, metrics, and admin controls."""

from __future__ import annotations

import json
import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel

from app.domain.leaderboards import jobs as leaderboard_jobs
from app.infra.postgres import get_pool
from app.obs import health
from app.obs import metrics as obs_metrics
from app.settings import settings

try:  # pragma: no cover - optional dependency
	from opentelemetry import trace
	_tracing_available = True
except Exception:  # pragma: no cover
	_tracing_available = False
	trace = None  # type: ignore


router = APIRouter(prefix="", tags=["ops"])


def _resolve_token(x_admin_token: Optional[str], authorization: Optional[str]) -> Optional[str]:
	if x_admin_token:
		return x_admin_token
	if authorization and authorization.lower().startswith("bearer "):
		return authorization.split(" ", 1)[1]
	return None


async def require_admin(
	X_Admin_Token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
	authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> None:
	token = settings.obs_admin_token
	if not token:
		# Fail closed: if no token is configured, no admin access is allowed.
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="admin_token_not_configured")
	provided = _resolve_token(X_Admin_Token, authorization)
	if provided != token:
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")


async def require_metrics_access(
	X_Admin_Token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
	authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> None:
	if settings.obs_metrics_public:
		return
	await require_admin(X_Admin_Token=X_Admin_Token, authorization=authorization)


@router.get("/health/live")
async def health_live() -> dict[str, str]:
	return await health.liveness()


@router.get("/health/ready")
async def health_ready() -> Response:
	status_code, payload = await health.readiness()
	return JSONResponse(content=payload, status_code=status_code)


@router.get("/health/startup")
async def health_startup() -> Response:
	status_code, payload = await health.startup()
	return JSONResponse(content=payload, status_code=status_code)


@router.get("/health/idempotency")
async def health_idempotency() -> Response:
	try:
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.execute("SELECT 1")
		return JSONResponse({"status": "ok"})
	except Exception:
		return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


@router.get("/metrics")
async def prometheus_metrics(_: None = Depends(require_metrics_access)) -> Response:
	payload = generate_latest()
	return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


@router.post("/ops/trace/test")
async def trace_test(_: None = Depends(require_admin)) -> dict[str, str]:
	if settings.environment.lower() == "prod":
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="disabled in prod")
	if _tracing_available and trace is not None:
		tracer = trace.get_tracer(settings.service_name)
		with tracer.start_as_current_span("unihood.trace.test") as span:  # pragma: no cover - optional
			span.set_attribute("component", "ops")
			span.set_attribute("sample", True)
	return {"status": "ok"}


@router.post("/ops/rollover")
async def trigger_rollover(_: None = Depends(require_admin)) -> dict[str, str]:
	start = time.perf_counter()
	try:
		await leaderboard_jobs.finalize_daily_leaderboards()
		obs_metrics.record_job_run(
			"leaderboard_rollover",
			result="ok",
			duration_seconds=time.perf_counter() - start,
		)
		return {"status": "ok"}
	except Exception as exc:
		obs_metrics.record_job_run("leaderboard_rollover", result="error")
		raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="rollover_failed") from exc


class SafetyUiMetric(BaseModel):
	event: Literal[
		"quarantine_reveal",
		"quarantine_decision",
		"thresholds_simulate",
		"hash_import",
		"url_query",
	]
	verdict: Literal["clean", "tombstone", "blocked"] | None = None
	count: int | None = None


@router.post("/ops/ui-metrics", status_code=status.HTTP_202_ACCEPTED)
async def record_ui_metric(payload: SafetyUiMetric) -> dict[str, str]:
	if payload.event == "quarantine_reveal":
		obs_metrics.inc_ui_safety_reveal()
	elif payload.event == "quarantine_decision":
		if payload.verdict is None:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="verdict_required")
		obs_metrics.inc_ui_safety_decision(payload.verdict)
	elif payload.event == "thresholds_simulate":
		obs_metrics.inc_ui_safety_thresholds_simulate()
	elif payload.event == "hash_import":
		if payload.count is None or payload.count <= 0:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="count_required")
		obs_metrics.inc_ui_safety_hash_import_rows(payload.count)
	elif payload.event == "url_query":
		obs_metrics.inc_ui_safety_url_query()
	return {"status": "recorded"}


def _json(payload: dict) -> str:
	return json.dumps(payload, separators=(",", ":"), sort_keys=True)
