"""FastAPI routes for leaderboards & streaks."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.leaderboards.models import LeaderboardPeriod, LeaderboardScope
from app.domain.leaderboards.schemas import LeaderboardResponseSchema, MySummarySchema, StreakSummarySchema
from app.domain.leaderboards.service import LeaderboardService
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])

_service = LeaderboardService()


# Note: /me/summary must be defined BEFORE /{scope} to avoid route conflicts
@router.get("/me/summary", response_model=MySummarySchema)
async def my_summary_endpoint(
	auth_user: AuthenticatedUser = Depends(get_current_user),
	ymd: Optional[int] = Query(default=None, description="Calendar date in YYYYMMDD"),
) -> MySummarySchema:
	try:
		user_uuid = UUID(auth_user.id)
		campus_uuid = UUID(auth_user.campus_id) if auth_user.campus_id else None
		return await _service.get_my_summary(user_id=user_uuid, campus_id=campus_uuid, ymd=ymd)
	except ValueError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/streaks/{user_id}", response_model=StreakSummarySchema)
async def streak_summary_endpoint(user_id: UUID) -> StreakSummarySchema:
	return await _service.get_streak_summary(user_id)


@router.get("/{scope}", response_model=LeaderboardResponseSchema)
async def leaderboard_endpoint(
	scope: LeaderboardScope,
	period: LeaderboardPeriod = Query(default=LeaderboardPeriod.DAILY),
	campus_id: UUID = Query(..., description="Campus identifier"),
	ymd: Optional[int] = Query(default=None, description="Calendar date in YYYYMMDD"),
	limit: int = Query(default=100, ge=1, le=500),
) -> LeaderboardResponseSchema:
	try:
		return await _service.get_leaderboard(
			scope=scope,
			period=period,
			campus_id=campus_id,
			ymd=ymd,
			limit=limit,
		)
	except ValueError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
