"""Domain models for mini-activities (Phase 5)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, Optional


ActivityKind = str
ActivityState = str
RoundState = str


ACTIVITY_KINDS: tuple[ActivityKind, ...] = (
	"typing_duel",
	"story_alt",
	"trivia",
	"rps",
)

ACTIVITY_STATES: tuple[ActivityState, ...] = (
	"lobby",
	"active",
	"completed",
	"cancelled",
	"expired",
)

ROUND_STATES: tuple[RoundState, ...] = (
	"pending",
	"open",
	"closed",
	"scored",
)


@dataclass(slots=True)
class Activity:
	"""Core persisted activity record."""

	id: str
	kind: ActivityKind
	convo_id: str
	user_a: str
	user_b: str
	state: ActivityState
	created_at: datetime
	started_at: Optional[datetime] = None
	ended_at: Optional[datetime] = None
	meta: Dict[str, Any] = field(default_factory=dict)

	def participants(self) -> tuple[str, str]:
		return (self.user_a, self.user_b)

	def includes(self, user_id: str) -> bool:
		return user_id in self.participants()

	def to_summary(self) -> dict[str, Any]:
		return {
			"id": self.id,
			"kind": self.kind,
			"state": self.state,
			"user_a": self.user_a,
			"user_b": self.user_b,
			"created_at": self.created_at,
			"started_at": self.started_at,
			"ended_at": self.ended_at,
			"meta": self.meta,
		}


@dataclass(slots=True)
class ActivityRound:
	"""Represents a single round/turn within an activity."""

	id: str
	activity_id: str
	idx: int
	state: RoundState
	opened_at: Optional[datetime]
	closed_at: Optional[datetime]
	meta: Dict[str, Any] = field(default_factory=dict)

	def to_payload(self) -> dict[str, Any]:
		return {
			"id": self.id,
			"activity_id": self.activity_id,
			"idx": self.idx,
			"state": self.state,
			"opened_at": self.opened_at,
			"closed_at": self.closed_at,
			"meta": self.meta,
		}


@dataclass(slots=True)
class TypingSubmission:
	round_id: str
	user_id: str
	text: str
	received_at: datetime


@dataclass(slots=True)
class StoryLine:
	activity_id: str
	idx: int
	user_id: str
	content: str
	created_at: datetime


@dataclass(slots=True)
class TriviaQuestion:
	id: str
	prompt: str
	options: Iterable[str]
	correct_idx: int


@dataclass(slots=True)
class TriviaAnswer:
	round_id: str
	user_id: str
	choice_idx: int
	latency_ms: int
	created_at: datetime


@dataclass(slots=True)
class RpsMove:
	round_id: str
	user_id: str
	commit_hash: Optional[str]
	choice: Optional[str]
	nonce: Optional[str]
	phase: str
	created_at: datetime


@dataclass(slots=True)
class ScoreBoard:
	activity_id: str
	totals: Dict[str, float] = field(default_factory=dict)
	per_round: Dict[int, Dict[str, float]] = field(default_factory=dict)

	def add_score(self, round_idx: int, user_id: str, score: float) -> None:
		self.totals[user_id] = self.totals.get(user_id, 0.0) + score
		round_scores = self.per_round.setdefault(round_idx, {})
		round_scores[user_id] = round_scores.get(user_id, 0.0) + score

	def to_payload(self) -> dict[str, Any]:
		return {
			"activity_id": self.activity_id,
			"totals": self.totals,
			"per_round": [
				{"idx": idx, **{k: v for k, v in scores.items()}}
				for idx, scores in sorted(self.per_round.items())
			],
		}


def other_participant(activity: Activity, user_id: str) -> str:
	"""Return the peer user id for an activity participant."""
	user_a, user_b = activity.participants()
	if user_id == user_a:
		return user_b
	if user_id == user_b:
		return user_a
	raise ValueError("user not part of activity")
