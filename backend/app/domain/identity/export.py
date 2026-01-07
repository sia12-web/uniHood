"""Data export archive helpers."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from app.domain.identity import audit, policy, schemas
from app.domain.identity import s3 as identity_s3
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _job_key(user_id: str) -> str:
	return f"export:job:{user_id}"


def _serialize(payload: dict[str, Any]) -> str:
	return json.dumps(payload)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
	if not value:
		return None
	return datetime.fromisoformat(value)


def _build_default(status: str, requested_at: datetime, *, download_url: Optional[str] = None, completed_at: Optional[datetime] = None) -> dict[str, Any]:
	return {
		"status": status,
		"requested_at": requested_at.isoformat(),
		"completed_at": completed_at.isoformat() if completed_at else None,
		"download_url": download_url,
	}


def _to_schema(payload: dict[str, Any]) -> schemas.ExportStatus:
	return schemas.ExportStatus(
		status=payload["status"],
		requested_at=_parse_iso(payload.get("requested_at")) or _now(),
		completed_at=_parse_iso(payload.get("completed_at")),
		download_url=payload.get("download_url"),
	)


async def request_export(auth_user: AuthenticatedUser) -> schemas.ExportStatus:
	await policy.enforce_export_request_rate(auth_user.id)
	key = _job_key(auth_user.id)
	existing = await redis_client.get(key)
	if existing:
		payload = json.loads(existing)
		if payload.get("status") == "pending":
			return _to_schema(payload)
	job = _build_default("pending", _now())
	await redis_client.set(key, _serialize(job), ex=policy.EXPORT_JOB_TTL_SECONDS)
	obs_metrics.inc_identity_export_request()
	await audit.log_event("export_requested", user_id=auth_user.id, meta={"job": key})
	return _to_schema(job)


async def get_status(user_id: str) -> Optional[schemas.ExportStatus]:
	data = await redis_client.get(_job_key(user_id))
	if not data:
		return None
	return _to_schema(json.loads(data))


async def mark_ready(user_id: str, *, download_path: Optional[str] = None) -> Optional[schemas.ExportStatus]:
	key = _job_key(user_id)
	data = await redis_client.get(key)
	if not data:
		return None
	payload = json.loads(data)
	completed_at = _now()
	if not download_path:
		token = secrets.token_hex(8)
		download_path = f"exports/{user_id}/{token}.zip"
	url = f"{identity_s3.DEFAULT_BASE_URL.rstrip('/')}/{download_path}"
	payload.update(
		{
			"status": "ready",
			"completed_at": completed_at.isoformat(),
			"download_url": url,
		}
	)
	await redis_client.set(key, _serialize(payload), ex=policy.EXPORT_JOB_TTL_SECONDS)
	await audit.log_event("export_ready", user_id=user_id, meta={"path": download_path})
	return _to_schema(payload)


async def clear_job(user_id: str) -> None:
	await redis_client.delete(_job_key(user_id))
