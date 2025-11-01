"""Upload helpers for communities."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:uploads"])
_service = CommunitiesService()


@router.post("/uploads/presign", response_model=dto.UploadPresignResponse)
async def presign_upload_endpoint(
	payload: dto.UploadPresignRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.UploadPresignResponse:
	try:
		return await _service.presign_upload(auth_user, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
