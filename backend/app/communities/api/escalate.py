"""Escalation endpoint for moderation concerns."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.communities.api._errors import to_http_error
from app.communities.domain.escalation_service import EscalationService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:escalations"])
_service = EscalationService()


@router.post(
	"/groups/{group_id}/escalate",
	response_model=dto.AuditEventResponse,
	status_code=status.HTTP_202_ACCEPTED,
)
async def escalate_moderation_endpoint(
	group_id: UUID,
	payload: dto.EscalateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.AuditEventResponse:
	try:
		return await _service.escalate(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
