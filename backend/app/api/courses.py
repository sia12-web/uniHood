"""REST surface for course controls."""

from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import courses, schemas
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/universities/{campus_id}/popular-courses", response_model=List[schemas.Course])
async def popular_courses(campus_id: UUID) -> List[schemas.Course]:
    return await courses.get_popular_courses(campus_id)


@router.get("/user/courses", response_model=List[schemas.UserCourse])
async def my_courses(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[schemas.UserCourse]:
    return await courses.get_user_courses(auth_user.id)


@router.post("/user/courses", response_model=List[schemas.UserCourse])
async def set_courses(
    payload: schemas.CourseBulkSetRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.UserCourse]:
    return await courses.set_user_courses(auth_user.id, payload.codes, payload.visibility)
