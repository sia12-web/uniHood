from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.security_deps import get_current_user
from app.domain.meetups import schemas, service
from app.infra.auth import AuthenticatedUser

router = APIRouter(prefix="/meetups", tags=["meetups"])
_service = service.MeetupService()


@router.post("/", response_model=schemas.MeetupResponse, status_code=status.HTTP_201_CREATED)
async def create_meetup(
    payload: schemas.MeetupCreateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.create_meetup(auth_user, payload)


@router.get("/", response_model=List[schemas.MeetupResponse])
async def list_meetups(
    campus_id: Optional[str] = None,
    category: Optional[schemas.MeetupCategory] = None,
    user_id: Optional[str] = Query(default=None, description="Filter by participant ID"),
    creator_id: Optional[str] = Query(default=None, description="Filter by creator ID"),
    year: Optional[int] = Query(default=None, description="Filter by year (e.g. 2025)"),
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    # Default to user's campus if not provided
    cid = campus_id or auth_user.campus_id
    if not cid:
        raise HTTPException(status_code=400, detail="Campus ID required")
    return await _service.list_meetups(auth_user, cid, category, participant_id=user_id, creator_id=creator_id, year=year)




@router.post("/{meetup_id}/reviews", response_model=schemas.MeetupReviewResponse)
async def create_review(
    meetup_id: UUID,
    payload: schemas.MeetupReviewCreateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.create_review(meetup_id, auth_user, payload)


@router.get("/{meetup_id}/reviews", response_model=List[schemas.MeetupReviewResponse])
async def list_reviews(
    meetup_id: UUID,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.get_reviews(meetup_id, auth_user)

@router.put("/{meetup_id}", response_model=schemas.MeetupResponse)
async def update_meetup(
    meetup_id: UUID,
    payload: schemas.MeetupUpdateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.update_meetup(meetup_id, auth_user, payload)


@router.post("/{meetup_id}/join", status_code=status.HTTP_204_NO_CONTENT)
async def join_meetup(
    meetup_id: UUID,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    await _service.join_meetup(meetup_id, auth_user)


@router.post("/{meetup_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_meetup(
    meetup_id: UUID,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    await _service.leave_meetup(meetup_id, auth_user)


@router.post("/{meetup_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_meetup(
    meetup_id: UUID,
    reason: str = Query(..., min_length=3),
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    await _service.cancel_meetup(meetup_id, reason, auth_user)


@router.get("/count/upcoming", response_model=int)
async def get_meetups_count(
    campus_id: Optional[str] = None,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    cid = campus_id or auth_user.campus_id
    if not cid:
         raise HTTPException(status_code=400, detail="Campus ID required")
    return await _service.get_upcoming_count(auth_user, cid)
    

@router.get("/usage", response_model=schemas.MeetupUsageResponse)
async def get_meetup_usage(
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.get_usage(auth_user)


@router.get("/{meetup_id}", response_model=schemas.MeetupDetailResponse)
async def get_meetup(
    meetup_id: UUID,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    return await _service.get_meetup(meetup_id, auth_user)


@router.post("/{meetup_id}/attendance", status_code=status.HTTP_204_NO_CONTENT)
async def update_attendance(
    meetup_id: UUID,
    payload: schemas.MeetupAttendanceUpdateRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    await _service.update_attendance(meetup_id, auth_user, payload)
