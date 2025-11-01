"""Attachment endpoints for communities."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:attachments"])
_service = CommunitiesService()


@router.post("/attachments", response_model=dto.AttachmentResponse, status_code=201)
async def create_attachment_endpoint(
	payload: dto.AttachmentCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.AttachmentResponse:
	try:
		return await _service.create_attachment(auth_user, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
