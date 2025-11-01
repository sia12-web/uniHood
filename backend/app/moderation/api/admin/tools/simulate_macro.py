"""Macro simulation endpoint scaffolding."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.infra.auth import AuthenticatedUser, get_current_user
from app.moderation.domain.tools import (
    AdminToolsExecutor,
    MacroPlan,
    RunMacroRequest,
    get_admin_tools_executor,
)

router = APIRouter(prefix="/api/mod/v1/admin/tools", tags=["moderation:admin:tools"])


def _not_implemented(exc: NotImplementedError) -> HTTPException:
    detail = str(exc) or "operation not implemented"
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=detail)


@router.post("/simulate/macro", response_model=MacroPlan, status_code=status.HTTP_200_OK)
async def simulate_macro(
    payload: RunMacroRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
    executor: AdminToolsExecutor = Depends(get_admin_tools_executor),
) -> MacroPlan:
    try:
        return await executor.simulate_macro(payload, actor_id=auth_user.id)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


__all__ = ["router"]
