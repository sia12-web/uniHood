"""FastAPI routes for clubs."""

from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.domain.clubs import service, schemas
from app.infra.auth import AuthenticatedUser, get_current_user
from app.api.request_id import get_request_id
from app.infra.postgres import get_pool
from app.obs import audit as obs_audit

router = APIRouter(prefix="/clubs", tags=["clubs"])

_club_service = service.ClubService()

@router.post("/", response_model=schemas.ClubResponse, status_code=status.HTTP_201_CREATED)
async def create_club_endpoint(
    request: Request,
    payload: schemas.ClubCreateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ClubResponse:
    try:
        # Default to user's campus if not provided? 
        # For now, let service handle it or payload carries it.
        # But payload schema assumes optional.
        if not payload.campus_id and auth_user.campus_id:
            payload.campus_id = UUID(auth_user.campus_id)
            
        result = await _club_service.create_club(auth_user.id, payload)
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        # Generic error handling
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))
        
    await obs_audit.log_signed_intent_event(
        request,
        auth_user,
        "clubs.create",
        extra={"club_id": str(result.id), "name": result.name},
    )
    return result

@router.get("/", response_model=List[schemas.ClubResponse])
async def list_clubs_endpoint(
    campus_id: str | None = None,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.ClubResponse]:
    try:
        cid = UUID(campus_id) if campus_id else None
        # Default to listing all or user's campus?
        # Let's list all for now as per "others can join them" implying discovery
        # but usually scoping to campus is good.
        if not cid and auth_user.campus_id:
             cid = UUID(auth_user.campus_id)
             
        return await _club_service.list_clubs(cid)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))

@router.get("/{club_id}", response_model=schemas.ClubDetailResponse)
async def get_club_endpoint(
    club_id: str,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ClubDetailResponse:
    try:
        return await _club_service.get_club(UUID(club_id))
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))

@router.post("/{club_id}/join", status_code=status.HTTP_200_OK)
async def join_club_endpoint(
    request: Request,
    club_id: str,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
    try:
        await _club_service.join_club(auth_user.id, UUID(club_id))
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await obs_audit.log_signed_intent_event(
        request,
        auth_user,
        "clubs.join",
        extra={"club_id": club_id},
    )
    return {"ok": True}
