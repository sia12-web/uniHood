"""Actions catalog admin endpoints (Phase 6 scaffolding)."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.infra.auth import AuthenticatedUser, get_current_user
from app.moderation.domain.tools import (
    ActionCreateRequest,
    ActionFilter,
    ActionRecord,
    ActionsCatalogService,
    get_actions_catalog_service,
)

router = APIRouter(prefix="/api/mod/v1/admin/tools", tags=["moderation:admin:tools"])


def _not_implemented(exc: NotImplementedError) -> HTTPException:
    detail = str(exc) or "operation not implemented"
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=detail)


@router.get("/actions", response_model=list[ActionRecord])
async def list_actions(
    *,
    key: Optional[str] = Query(default=None),
    kind: Optional[Literal["atomic", "macro"]] = Query(default=None),
    active: Optional[bool] = Query(default=None),
    service: ActionsCatalogService = Depends(get_actions_catalog_service),
) -> list[ActionRecord]:
    filters = ActionFilter(key=key, kind=kind, active=active)
    try:
        return await service.list_actions(filters)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/actions", response_model=ActionRecord, status_code=status.HTTP_201_CREATED)
async def create_action(
    payload: ActionCreateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
    service: ActionsCatalogService = Depends(get_actions_catalog_service),
) -> ActionRecord:
    try:
        return await service.create_action(payload, actor_id=auth_user.id)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except ValueError as exc:
        detail = str(exc) or "invalid action"
        status_code = status.HTTP_409_CONFLICT if "exists" in detail else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code, detail=detail) from exc


@router.get("/actions/{key}/{version}", response_model=ActionRecord)
async def get_action(
    key: str,
    version: int,
    service: ActionsCatalogService = Depends(get_actions_catalog_service),
) -> ActionRecord:
    try:
        return await service.get_action(key=key, version=version)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/actions/{key}/{version}/deactivate", response_model=ActionRecord)
async def deactivate_action(
    key: str,
    version: int,
    auth_user: AuthenticatedUser = Depends(get_current_user),
    service: ActionsCatalogService = Depends(get_actions_catalog_service),
) -> ActionRecord:
    try:
        return await service.deactivate_action(key=key, version=version, actor_id=auth_user.id)
    except NotImplementedError as exc:  # pragma: no cover - scaffolding placeholder
        raise _not_implemented(exc) from exc
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


__all__ = ["router"]
