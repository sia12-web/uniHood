"""Bundle export endpoint scaffolding."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse

from app.infra.auth import AuthenticatedUser, get_current_user
from app.moderation.domain.tools import BundleExportResult, BundleService, get_bundle_service

router = APIRouter(prefix="/api/mod/v1/admin/tools", tags=["moderation:admin:tools"])


def _not_implemented(exc: NotImplementedError) -> HTTPException:
    detail = str(exc) or "operation not implemented"
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=detail)


@router.get("/actions/export.yml", response_class=PlainTextResponse)
async def export_actions(
    keys: Optional[List[str]] = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
    service: BundleService = Depends(get_bundle_service),
) -> PlainTextResponse:
    _ = auth_user  # Actor is still validated by dependency stack.
    try:
        result: BundleExportResult = await service.export(keys or [])
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    headers = {}
    if result.signature:
        headers["X-Bundle-Signature"] = result.signature
    return PlainTextResponse(result.yaml, status_code=status.HTTP_200_OK, headers=headers)


__all__ = ["router"]
