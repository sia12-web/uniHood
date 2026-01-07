"""FastAPI routes for leaderboards & streaks."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.leaderboards.models import LeaderboardPeriod, LeaderboardScope
from app.domain.leaderboards.schemas import (
	LeaderboardResponseSchema,
	MySummarySchema,
	RecordGameOutcomeRequest,
	RecordGameOutcomeResponse,
	StreakSummarySchema,
)
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


@router.get("/users/{user_id}/summary", response_model=MySummarySchema)
async def user_summary_endpoint(
	user_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
	campus_id: UUID = Query(default=None),
	ymd: Optional[int] = Query(default=None),
) -> MySummarySchema:
	try:
		effective_campus_id = campus_id or (UUID(auth_user.campus_id) if auth_user.campus_id else None)
			
		return await _service.get_my_summary(user_id=user_id, campus_id=effective_campus_id, ymd=ymd)
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
	effective_campus_id = campus_id
	try:
		return await _service.get_leaderboard(
			scope=scope,
			period=period,
			campus_id=effective_campus_id,
			ymd=ymd,
			limit=limit,
		)
	except ValueError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/record-outcome", response_model=RecordGameOutcomeResponse)
async def record_game_outcome_endpoint(
	payload: RecordGameOutcomeRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> RecordGameOutcomeResponse:
	"""
	Record a game outcome for leaderboard tracking.
	This endpoint is called by external activity services (e.g. activities-core)
	or by the frontend when a game ends.
	
	The authenticated user must be one of the participants.
	"""
	# Verify the caller is a participant
	if auth_user.id not in payload.user_ids:
		raise HTTPException(
			status.HTTP_403_FORBIDDEN,
			detail="caller_not_participant"
		)
	
	try:
		# Build campus map from request
		campus_map = {}
		if payload.campus_id:
			for uid in payload.user_ids:
				campus_map[uid] = payload.campus_id
		elif auth_user.campus_id:
			for uid in payload.user_ids:
				campus_map[uid] = auth_user.campus_id
		
		awarded = await _service.record_activity_outcome(
			user_ids=payload.user_ids,
			winner_id=payload.winner_id,
			game_kind=payload.game_kind,
			campus_map=campus_map,
			duration_seconds=payload.duration_seconds,
			move_count=payload.move_count,
		)
		return RecordGameOutcomeResponse(recorded=True, awarded_users=awarded)
	except Exception as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

