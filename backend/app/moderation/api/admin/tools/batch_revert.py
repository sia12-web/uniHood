"""Batch revert endpoint scaffolding."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.infra.auth import AuthenticatedUser, get_current_user
from app.moderation.domain.tools import (
    AdminToolsExecutor,
    BatchRevertRequest,
    JobHandle,
    get_admin_tools_executor,
)

router = APIRouter(prefix="/api/mod/v1/admin/tools", tags=["moderation:admin:tools"])


def _not_implemented(exc: NotImplementedError) -> HTTPException:
    detail = str(exc) or "operation not implemented"
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=detail)


@router.post("/run/batch_revert", response_model=JobHandle, status_code=status.HTTP_202_ACCEPTED)
async def run_batch_revert(
    payload: BatchRevertRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
    executor: AdminToolsExecutor = Depends(get_admin_tools_executor),
) -> JobHandle:
    try:
        return await executor.run_batch_revert(payload, actor_id=auth_user.id)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


__all__ = ["router"]
