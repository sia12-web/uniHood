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
	display_name: Optional[str] = None
	handle: Optional[str] = None


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


class RecordGameOutcomeRequest(BaseModel):
	"""Request to record a game outcome from external services (e.g. activities-core)."""
	user_ids: list[str] = Field(..., description="List of participant user IDs")
	winner_id: Optional[str] = Field(default=None, description="User ID of the winner, if any")
	campus_id: Optional[str] = Field(default=None, description="Campus ID for the game")
	game_kind: str = Field(default="tictactoe", description="Type of game")
	duration_seconds: int = Field(default=60, ge=0, description="Game duration in seconds")
	move_count: int = Field(default=5, ge=0, description="Number of moves in the game")


class RecordGameOutcomeResponse(BaseModel):
	"""Response after recording a game outcome."""
	recorded: bool
	awarded_users: list[str] = Field(default_factory=list)

