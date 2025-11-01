"""Pydantic schemas for Phase 5 mini-activities."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

ActivityKind = Literal["typing_duel", "story_alt", "trivia", "rps"]
ActivityState = Literal["lobby", "active", "completed", "cancelled", "expired"]
RoundState = Literal["pending", "open", "closed", "scored"]


class TypingOptions(BaseModel):
	duration_s: int | None = Field(default=60, ge=10, le=300)


class StoryOptions(BaseModel):
	turns: int | None = Field(default=6, ge=2, le=20)
	turn_seconds: int | None = Field(default=60, ge=10, le=180)
	max_chars_per_turn: int | None = Field(default=400, ge=80, le=800)


class TriviaOptions(BaseModel):
	questions: int | None = Field(default=5, ge=1, le=20)
	per_question_s: int | None = Field(default=10, ge=5, le=60)


class RpsOptions(BaseModel):
	best_of: int | None = Field(default=3, ge=1, le=9)


class ActivityOptions(BaseModel):
	typing: Optional[TypingOptions] = None
	story: Optional[StoryOptions] = None
	trivia: Optional[TriviaOptions] = None
	rps: Optional[RpsOptions] = None


class CreateActivityRequest(BaseModel):
	kind: ActivityKind
	options: Optional[ActivityOptions] = None


class ActivitySummary(BaseModel):
	id: str
	kind: ActivityKind
	state: ActivityState
	user_a: str
	user_b: str
	created_at: datetime
	started_at: Optional[datetime] = None
	ended_at: Optional[datetime] = None
	meta: Dict[str, object] = Field(default_factory=dict)


class ActivityDetail(ActivitySummary):
	rounds: List["ActivityRound"] = Field(default_factory=list)


class ActivityRound(BaseModel):
	id: str
	activity_id: str
	idx: int
	state: RoundState
	opened_at: Optional[datetime] = None
	closed_at: Optional[datetime] = None
	meta: Dict[str, object] = Field(default_factory=dict)


class TypingSubmitRequest(BaseModel):
	activity_id: str
	round_idx: int
	text: str = Field(..., min_length=1, max_length=2000)


class StorySubmitRequest(BaseModel):
	activity_id: str
	content: str = Field(..., min_length=1, max_length=400)


class TriviaAnswerRequest(BaseModel):
	activity_id: str
	round_idx: int
	choice_idx: int = Field(..., ge=0, le=3)


class RpsCommitRequest(BaseModel):
	activity_id: str
	round_idx: int
	commit_hash: str = Field(..., min_length=32, max_length=128)


class RpsRevealRequest(BaseModel):
	activity_id: str
	round_idx: int
	choice: Literal["rock", "paper", "scissors"]
	commit_hash: str = Field(..., min_length=32, max_length=128)
	nonce: str = Field(..., min_length=4, max_length=64)


class ActivityScorePayload(BaseModel):
	activity_id: str
	totals: Dict[str, float]
	per_round: List[Dict[str, float]] = Field(default_factory=list)


class CancelActivityRequest(BaseModel):
	reason: Literal["cancelled", "expired"] = "cancelled"


class TriviaSeedRequest(BaseModel):
	questions: int = Field(default=5, ge=1, le=20)


class TypingPromptResponse(BaseModel):
	prompt: str
	duration_s: int
	close_at_ms: int


ActivityDetail.model_rebuild()
