"""Audit event listing endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.audit_service import AuditService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:audit"])
_service = AuditService()


@router.get("/groups/{group_id}/audit", response_model=list[dto.AuditEventResponse])
async def list_audit_events_endpoint(
	group_id: UUID,
	limit: int = Query(default=50, ge=1, le=100),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dto.AuditEventResponse]:
	try:
		return await _service.list_events(auth_user, group_id, limit=limit)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
