"""Pydantic schemas for leaderboards & streaks APIs."""

from __future__ import annotations

from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.leaderboards.models import LeaderboardPeriod, LeaderboardScope


class LeaderboardRowSchema(BaseModel):
	rank: int = Field(..., ge=1)
	user_id: UUID
	score: float


class LeaderboardResponseSchema(BaseModel):
	scope: LeaderboardScope
	period: LeaderboardPeriod
	ymd: int
	campus_id: UUID
	items: list[LeaderboardRowSchema]


class StreakSummarySchema(BaseModel):
	current: int = 0
	best: int = 0
	last_active_ymd: int = 0


class BadgeSummarySchema(BaseModel):
	kind: str
	earned_ymd: int
	meta: Dict[str, object] = Field(default_factory=dict)


class MySummarySchema(BaseModel):
	ymd: int
	campus_id: UUID
	ranks: Dict[str, Optional[int]]
	scores: Dict[str, Optional[float]]
	counts: Dict[str, int] = Field(default_factory=dict)
	streak: StreakSummarySchema
	badges: list[BadgeSummarySchema] = Field(default_factory=list)
