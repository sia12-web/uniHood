"""REST surface for course controls."""

from __future__ import annotations

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import courses, profile_service, schemas
from app.domain.identity.service import ProfileNotFound
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


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
	try:
		# Ensure the user exists (dev synthetic auth may point to a missing record).
		await profile_service.get_profile(auth_user.id, auth_user=auth_user)
	except ProfileNotFound:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found") from None

	records = await courses.set_user_courses(auth_user.id, payload.codes, payload.visibility)

	# Keep cached profile data in sync with the latest course selection.
	try:
		await profile_service.invalidate_profile_cache(str(auth_user.id))
	except Exception:
		logger.warning("Failed to invalidate profile cache after course update", exc_info=True)

	return records
