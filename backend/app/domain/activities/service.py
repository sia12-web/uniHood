"""Service orchestration for Phase 5 mini-activities."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

import asyncpg
import uuid

from app.domain.activities import models, outbox, policy, prompts, schemas, scoring, sockets, timers, trivia_bank
from app.domain.chat.models import ConversationKey
from app.domain.leaderboards.service import LeaderboardService
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool


class ActivitiesError(RuntimeError):
	pass


class _MemoryStore:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self.activities: Dict[str, models.Activity] = {}
		self.rounds: Dict[str, Dict[int, models.ActivityRound]] = {}
		self.typing_submissions: Dict[tuple[str, str], models.TypingSubmission] = {}
		self.story_lines: Dict[str, List[models.StoryLine]] = {}
		self.trivia_answers: Dict[tuple[str, str], models.TriviaAnswer] = {}
		self.rps_moves: Dict[tuple[str, str], models.RpsMove] = {}

	async def reset(self) -> None:
		async with self._lock:
			self.activities.clear()
			self.rounds.clear()
			self.typing_submissions.clear()
			self.story_lines.clear()
			self.trivia_answers.clear()
			self.rps_moves.clear()

	async def create_activity(self, activity: models.Activity) -> models.Activity:
		async with self._lock:
			self.activities[activity.id] = activity
			return activity

	async def save_activity(self, activity: models.Activity) -> None:
		async with self._lock:
			self.activities[activity.id] = activity

	async def get_activity(self, activity_id: str) -> Optional[models.Activity]:
		async with self._lock:
			return self.activities.get(activity_id)

	async def list_activities_for_user(self, user_id: str) -> List[models.Activity]:
		async with self._lock:
			return [act for act in self.activities.values() if act.includes(user_id)]

	async def create_round(self, round_obj: models.ActivityRound) -> models.ActivityRound:
		async with self._lock:
			self.rounds.setdefault(round_obj.activity_id, {})[round_obj.idx] = round_obj
			return round_obj

	async def save_round(self, round_obj: models.ActivityRound) -> None:
		async with self._lock:
			self.rounds.setdefault(round_obj.activity_id, {})[round_obj.idx] = round_obj

	async def get_round(self, activity_id: str, round_idx: int) -> Optional[models.ActivityRound]:
		async with self._lock:
			return self.rounds.get(activity_id, {}).get(round_idx)

	async def list_rounds(self, activity_id: str) -> List[models.ActivityRound]:
		async with self._lock:
			return sorted(self.rounds.get(activity_id, {}).values(), key=lambda r: r.idx)

	async def upsert_typing_submission(self, submission: models.TypingSubmission) -> None:
		async with self._lock:
			self.typing_submissions[(submission.round_id, submission.user_id)] = submission

	async def list_typing_submissions(self, round_id: str) -> List[models.TypingSubmission]:
		async with self._lock:
			return [sub for (rid, _), sub in self.typing_submissions.items() if rid == round_id]

	async def append_story_line(self, line: models.StoryLine) -> None:
		async with self._lock:
			self.story_lines.setdefault(line.activity_id, []).append(line)

	async def list_story_lines(self, activity_id: str) -> List[models.StoryLine]:
		async with self._lock:
			return sorted(self.story_lines.get(activity_id, []), key=lambda line: line.idx)

	async def upsert_trivia_answer(self, answer: models.TriviaAnswer) -> None:
		async with self._lock:
			self.trivia_answers[(answer.round_id, answer.user_id)] = answer

	async def list_trivia_answers(self, round_id: str) -> List[models.TriviaAnswer]:
		async with self._lock:
			return [ans for (rid, _), ans in self.trivia_answers.items() if rid == round_id]

	async def upsert_rps_move(self, move: models.RpsMove) -> None:
		async with self._lock:
			self.rps_moves[(move.round_id, move.user_id)] = move

	async def list_rps_moves(self, round_id: str) -> List[models.RpsMove]:
		async with self._lock:
			return [mv for (rid, _), mv in self.rps_moves.items() if rid == round_id]


_MEMORY = _MemoryStore()


def _now() -> datetime:
	return datetime.now(timezone.utc)


logger = logging.getLogger(__name__)


class ActivitiesRepository:
	def __init__(self) -> None:
		self._pool_checked = False
		self._pool: Optional[asyncpg.Pool] = None

	async def _pool_or_none(self) -> Optional[asyncpg.Pool]:
		if self._pool_checked:
			return self._pool
		self._pool_checked = True
		try:
			pool = await get_pool()
		except AssertionError:
			pool = None
		except Exception:
			pool = None
		self._pool = pool
		return pool

	async def create_activity(
		self,
		*,
		kind: str,
		convo_id: str,
		user_a: str,
		user_b: str,
		meta: Dict[str, object],
	) -> models.Activity:
		now = _now()
		activity = models.Activity(
			id=str(uuid.uuid4()),
			kind=kind,
			convo_id=convo_id,
			user_a=user_a,
			user_b=user_b,
			state="lobby",
			created_at=now,
			meta=dict(meta),
		)
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.create_activity(activity)
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO activities (id, kind, convo_id, user_a, user_b, state, created_at, meta)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				""",
				activity.id,
				activity.kind,
				activity.convo_id,
				activity.user_a,
				activity.user_b,
				activity.state,
				activity.created_at,
				json.dumps(activity.meta),
			)
		return activity

	async def save_activity(self, activity: models.Activity) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.save_activity(activity)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				UPDATE activities
				SET state=$2, started_at=$3, ended_at=$4, meta=$5
				WHERE id=$1
				""",
				activity.id,
				activity.state,
				activity.started_at,
				activity.ended_at,
				json.dumps(activity.meta),
			)

	async def get_activity(self, activity_id: str) -> Optional[models.Activity]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.get_activity(activity_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow("SELECT * FROM activities WHERE id=$1", activity_id)
		if not row:
			return None
		return _row_to_activity(row)

	async def list_activities_for_user(self, user_id: str) -> List[models.Activity]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_activities_for_user(user_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM activities
				WHERE user_a=$1 OR user_b=$1
				ORDER BY created_at DESC
				""",
				user_id,
			)
		return [_row_to_activity(row) for row in rows]

	async def create_round(
		self,
		*,
		activity_id: str,
		idx: int,
		state: str,
		meta: Dict[str, object],
		opened_at: Optional[datetime] = None,
		closed_at: Optional[datetime] = None,
	) -> models.ActivityRound:
		round_obj = models.ActivityRound(
			id=str(uuid.uuid4()),
			activity_id=activity_id,
			idx=idx,
			state=state,
			opened_at=opened_at,
			closed_at=closed_at,
			meta=dict(meta),
		)
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.create_round(round_obj)
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO activity_rounds (id, activity_id, idx, state, opened_at, closed_at, meta)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				""",
				round_obj.id,
				round_obj.activity_id,
				round_obj.idx,
				round_obj.state,
				round_obj.opened_at,
				round_obj.closed_at,
				json.dumps(round_obj.meta),
			)
		return round_obj

	async def save_round(self, round_obj: models.ActivityRound) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.save_round(round_obj)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				UPDATE activity_rounds
				SET state=$2, opened_at=$3, closed_at=$4, meta=$5
				WHERE id=$1
				""",
				round_obj.id,
				round_obj.state,
				round_obj.opened_at,
				round_obj.closed_at,
				json.dumps(round_obj.meta),
			)

	async def get_round(self, activity_id: str, round_idx: int) -> Optional[models.ActivityRound]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.get_round(activity_id, round_idx)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"SELECT * FROM activity_rounds WHERE activity_id=$1 AND idx=$2",
				activity_id,
				round_idx,
			)
		if not row:
			return None
		return _row_to_round(row)

	async def list_rounds(self, activity_id: str) -> List[models.ActivityRound]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_rounds(activity_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"SELECT * FROM activity_rounds WHERE activity_id=$1 ORDER BY idx",
				activity_id,
			)
		return [_row_to_round(row) for row in rows]

	async def upsert_typing_submission(self, submission: models.TypingSubmission) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.upsert_typing_submission(submission)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO typing_submissions (round_id, user_id, text, received_at)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (round_id, user_id)
				DO UPDATE SET text=EXCLUDED.text, received_at=EXCLUDED.received_at
				""",
				submission.round_id,
				submission.user_id,
				submission.text,
				submission.received_at,
			)

	async def list_typing_submissions(self, round_id: str) -> List[models.TypingSubmission]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_typing_submissions(round_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch("SELECT * FROM typing_submissions WHERE round_id=$1", round_id)
		return [
			models.TypingSubmission(
				round_id=str(row["round_id"]),
				user_id=str(row["user_id"]),
				text=row["text"],
				received_at=row["received_at"],
			)
			for row in rows
		]

	async def append_story_line(self, line: models.StoryLine) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.append_story_line(line)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO story_lines (activity_id, idx, user_id, content, created_at)
				VALUES ($1,$2,$3,$4,$5)
				""",
				line.activity_id,
				line.idx,
				line.user_id,
				line.content,
				line.created_at,
			)

	async def list_story_lines(self, activity_id: str) -> List[models.StoryLine]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_story_lines(activity_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"SELECT * FROM story_lines WHERE activity_id=$1 ORDER BY idx",
				activity_id,
			)
		return [
			models.StoryLine(
				activity_id=str(row["activity_id"]),
				idx=row["idx"],
				user_id=str(row["user_id"]),
				content=row["content"],
				created_at=row["created_at"],
			)
			for row in rows
		]

	async def upsert_trivia_answer(self, answer: models.TriviaAnswer) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.upsert_trivia_answer(answer)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO trivia_answers (round_id, user_id, choice_idx, latency_ms, created_at)
				VALUES ($1,$2,$3,$4,$5)
				ON CONFLICT (round_id, user_id)
				DO UPDATE SET choice_idx=EXCLUDED.choice_idx, latency_ms=EXCLUDED.latency_ms, created_at=EXCLUDED.created_at
				""",
				answer.round_id,
				answer.user_id,
				answer.choice_idx,
				answer.latency_ms,
				answer.created_at,
			)

	async def list_trivia_answers(self, round_id: str) -> List[models.TriviaAnswer]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_trivia_answers(round_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch("SELECT * FROM trivia_answers WHERE round_id=$1", round_id)
		return [
			models.TriviaAnswer(
				round_id=str(row["round_id"]),
				user_id=str(row["user_id"]),
				choice_idx=row["choice_idx"],
				latency_ms=row["latency_ms"],
				created_at=row["created_at"],
			)
			for row in rows
		]

	async def upsert_rps_move(self, move: models.RpsMove) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY.upsert_rps_move(move)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO rps_moves (round_id, user_id, commit_hash, choice, nonce, phase, created_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT (round_id, user_id)
				DO UPDATE SET commit_hash=EXCLUDED.commit_hash, choice=EXCLUDED.choice, nonce=EXCLUDED.nonce, phase=EXCLUDED.phase, created_at=EXCLUDED.created_at
				""",
				move.round_id,
				move.user_id,
				move.commit_hash,
				move.choice,
				move.nonce,
				move.phase,
				move.created_at,
			)

	async def list_rps_moves(self, round_id: str) -> List[models.RpsMove]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY.list_rps_moves(round_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch("SELECT * FROM rps_moves WHERE round_id=$1", round_id)
		return [
			models.RpsMove(
				round_id=str(row["round_id"]),
				user_id=str(row["user_id"]),
				commit_hash=row["commit_hash"],
				choice=row["choice"],
				nonce=row["nonce"],
				phase=row["phase"],
				created_at=row["created_at"],
			)
			for row in rows
		]

	async def fetch_participant_profiles(self, user_ids: Iterable[str]) -> Dict[str, Dict[str, Optional[str]]]:
		ids = [str(user_id) for user_id in user_ids if user_id]
		if not ids:
			return {}
		pool = await self._pool_or_none()
		if pool is None:
			return {user_id: {"handle": user_id, "display_name": user_id, "avatar_url": None} for user_id in ids}
		uuid_ids: list[uuid.UUID] = []
		for user_id in ids:
			try:
				uuid_ids.append(uuid.UUID(user_id))
			except ValueError:
				continue
		if not uuid_ids:
			return {user_id: {"handle": user_id, "display_name": user_id, "avatar_url": None} for user_id in ids}
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT id::text AS user_id, handle, COALESCE(display_name, handle) AS display_name, avatar_url
				FROM users
				WHERE id = ANY($1::uuid[])
				""",
				uuid_ids,
			)
		result: Dict[str, Dict[str, Optional[str]]] = {}
		for row in rows:
			user_id = row["user_id"]
			result[user_id] = {
				"handle": row.get("handle"),
				"display_name": row.get("display_name"),
				"avatar_url": row.get("avatar_url"),
			}
		for user_id in ids:
			result.setdefault(user_id, {"handle": user_id, "display_name": user_id, "avatar_url": None})
		return result


def _row_to_activity(row: asyncpg.Record) -> models.Activity:
	meta_value = row["meta"]
	if isinstance(meta_value, str):
		meta = json.loads(meta_value)
	else:
		meta = dict(meta_value or {})
	return models.Activity(
		id=str(row["id"]),
		kind=row["kind"],
		convo_id=row["convo_id"],
		user_a=str(row["user_a"]),
		user_b=str(row["user_b"]),
		state=row["state"],
		created_at=row["created_at"],
		started_at=row.get("started_at"),
		ended_at=row.get("ended_at"),
		meta=meta,
	)


def _row_to_round(row: asyncpg.Record) -> models.ActivityRound:
	meta_value = row["meta"]
	if isinstance(meta_value, str):
		meta = json.loads(meta_value)
	else:
		meta = dict(meta_value or {})
	return models.ActivityRound(
		id=str(row["id"]),
		activity_id=str(row["activity_id"]),
		idx=row["idx"],
		state=row["state"],
		opened_at=row.get("opened_at"),
		closed_at=row.get("closed_at"),
		meta=meta,
	)


async def reset_memory_state() -> None:
	await _MEMORY.reset()


def _winner_from_scoreboard(scoreboard: models.ScoreBoard) -> Optional[str]:
	if not scoreboard.totals:
		return None
	best = max(scoreboard.totals.values())
	winners = [user_id for user_id, value in scoreboard.totals.items() if math.isclose(value, best, rel_tol=1e-9, abs_tol=1e-9)]
	if len(winners) == 1:
		return winners[0]
	return None


def _scoreboard_from_activity(activity: models.Activity) -> models.ScoreBoard:
	raw = activity.meta.get("score") or {}
	sb = models.ScoreBoard(activity.id)
	for user_id, value in raw.get("totals", {}).items():
		sb.totals[user_id] = float(value)
	for entry in raw.get("per_round", []):
		if not isinstance(entry, dict):
			continue
		idx = int(entry.get("idx", 0))
		if idx <= 0:
			continue
		scores = {k: float(v) for k, v in entry.items() if k != "idx"}
		sb.per_round[idx] = scores
	participants_raw = raw.get("participants") or {}
	if isinstance(participants_raw, dict):
		for user_id, info in participants_raw.items():
			if isinstance(info, dict):
				sb.upsert_participant(
					str(user_id),
					handle=str(info.get("handle")) if info.get("handle") else None,
					display_name=str(info.get("display_name")) if info.get("display_name") else None,
					avatar_url=str(info.get("avatar_url")) if info.get("avatar_url") else None,
				)
	elif isinstance(participants_raw, list):
		for info in participants_raw:
			user_id = info.get("user_id") if isinstance(info, dict) else None
			if not user_id:
				continue
			sb.upsert_participant(
				str(user_id),
				handle=str(info.get("handle")) if info.get("handle") else None,
				display_name=str(info.get("display_name")) if info.get("display_name") else None,
				avatar_url=str(info.get("avatar_url")) if info.get("avatar_url") else None,
			)
	return sb


def _store_scoreboard(activity: models.Activity, scoreboard: models.ScoreBoard) -> None:
	activity.meta["score"] = {
		"totals": scoreboard.totals,
		"per_round": [
			{"idx": idx, **scores}
			for idx, scores in sorted(scoreboard.per_round.items())
		],
		"participants": {
			user_id: {
				"handle": participant.handle,
				"display_name": participant.display_name,
				"avatar_url": participant.avatar_url,
			}
			for user_id, participant in scoreboard.participants.items()
		},
	}


def _activity_summary(activity: models.Activity) -> schemas.ActivitySummary:
	return schemas.ActivitySummary(
		id=activity.id,
		kind=activity.kind,
		state=activity.state,
		user_a=activity.user_a,
		user_b=activity.user_b,
		created_at=activity.created_at,
		started_at=activity.started_at,
		ended_at=activity.ended_at,
		meta=activity.meta,
	)


def _round_schema(round_obj: models.ActivityRound) -> schemas.ActivityRound:
	return schemas.ActivityRound(
		id=round_obj.id,
		activity_id=round_obj.activity_id,
		idx=round_obj.idx,
		state=round_obj.state,
		opened_at=round_obj.opened_at,
		closed_at=round_obj.closed_at,
		meta=round_obj.meta,
	)


class ActivitiesService:
	def __init__(self, repository: ActivitiesRepository | None = None) -> None:
		self._repo = repository or ActivitiesRepository()
		self._leaderboards = LeaderboardService()

	def _track_participant_campus(self, activity: models.Activity, user_id: str, campus_id: Optional[str]) -> None:
		if not campus_id:
			return
		campus_map = activity.meta.setdefault("campus_map", {})
		stored = campus_map.get(user_id)
		if stored != campus_id:
			campus_map[user_id] = campus_id

	async def _populate_scoreboard_participants(
		self,
		activity: models.Activity,
		scoreboard: models.ScoreBoard,
	) -> models.ScoreBoard:
		profiles = await self._repo.fetch_participant_profiles(activity.participants())
		for user_id in activity.participants():
			info = profiles.get(user_id)
			if info:
				self._track_participant_campus(activity, user_id, info.get("campus_id"))
				scoreboard.upsert_participant(
					user_id,
					handle=info.get("handle"),
					display_name=info.get("display_name"),
					avatar_url=info.get("avatar_url"),
				)
			else:
				scoreboard.upsert_participant(user_id)
		return scoreboard

	async def _record_leaderboard_outcome(
		self,
		activity: models.Activity,
		scoreboard: Optional[models.ScoreBoard] = None,
		winner_hint: Optional[str] = None,
	) -> None:
		user_ids = [uid for uid in activity.participants() if uid]
		if not user_ids:
			return
		winner_id = winner_hint
		if winner_id is None and scoreboard is not None:
			winner_id = _winner_from_scoreboard(scoreboard)
		campus_map = activity.meta.get("campus_map") or {}
		
		# Calculate game duration for anti-cheat validation
		duration_seconds = 60  # Default
		if activity.started_at and activity.ended_at:
			duration_seconds = int((activity.ended_at - activity.started_at).total_seconds())
		
		# Calculate move count from activity rounds/submissions
		move_count = await self._get_activity_move_count(activity)
		
		try:
			await self._leaderboards.record_activity_outcome(
				user_ids=user_ids,
				winner_id=winner_id,
				campus_map=campus_map,
				duration_seconds=duration_seconds,
				move_count=move_count,
			)
		except Exception:
			logger.exception("Failed to update leaderboards for activity", extra={"activity_id": activity.id})

	async def _get_activity_move_count(self, activity: models.Activity) -> int:
		"""Calculate the number of meaningful moves/actions in an activity."""
		kind = activity.kind
		
		if kind == models.ActivityKind.TICTACTOE:
			# Count board moves from meta
			board = activity.meta.get("board", [])
			return sum(1 for cell in board if cell is not None and cell != "")
		
		elif kind == models.ActivityKind.TYPING_DUEL:
			# Count typing submissions
			rounds = await self._store.list_rounds(activity.id)
			if not rounds:
				return 0
			submissions = await self._store.list_typing_submissions(rounds[-1].id)
			return len(submissions)
		
		elif kind == models.ActivityKind.STORY_BUILDER:
			# Count story lines
			lines = await self._store.list_story_lines(activity.id)
			return len(lines)
		
		elif kind == models.ActivityKind.QUICK_TRIVIA:
			# Count trivia answers
			rounds = await self._store.list_rounds(activity.id)
			total_answers = 0
			for r in rounds:
				answers = await self._store.list_trivia_answers(r.id)
				total_answers += len(answers)
			return total_answers
		
		elif kind == models.ActivityKind.RPS:
			# Count RPS rounds played
			rounds = await self._store.list_rounds(activity.id)
			return len(rounds)
		
		return 10  # Default fallback

	def _normalize_meta(
		self,
		kind: str,
		options: schemas.ActivityOptions | None,
		user_a: str,
		user_b: str,
	) -> Dict[str, object]:
		meta: Dict[str, object] = {
			"participants": {"user_a": user_a, "user_b": user_b},
		}
		meta["score"] = {
			"totals": {user_a: 0.0, user_b: 0.0},
			"per_round": [],
		}
		opts = options or schemas.ActivityOptions()
		if kind == "typing_duel":
			duration = opts.typing.duration_s if opts.typing and opts.typing.duration_s else 60
			meta["typing"] = {"duration_s": duration}
		elif kind == "story_builder":
			turns = opts.story.turns if opts.story and opts.story.turns else 6
			turn_seconds = opts.story.turn_seconds if opts.story and opts.story.turn_seconds else 60
			max_chars = opts.story.max_chars_per_turn if opts.story and opts.story.max_chars_per_turn else 400
			meta["story"] = {
				"turns": turns,
				"turn_seconds": turn_seconds,
				"max_chars": max_chars,
				"next_turn": 1,
				"next_user": user_a,
				"seed": prompts.pick_story_seed(),
				"ready": {
					user_a: False,
					user_b: False,
				},
			}
		elif kind == "trivia":
			questions = opts.trivia.questions if opts.trivia and opts.trivia.questions else 5
			per_question = opts.trivia.per_question_s if opts.trivia and opts.trivia.per_question_s else 10
			items = trivia_bank.get_random_items(questions)
			meta["trivia"] = {
				"questions": [
					{"id": item.id, "prompt": item.prompt, "options": list(item.options), "correct_idx": item.correct_idx}
					for item in items
				],
				"per_question_s": per_question,
				"latency_totals": {user_a: 0, user_b: 0},
			}
		elif kind == "rps":
			best_of = opts.rps.best_of if opts.rps and opts.rps.best_of else 3
			if best_of % 2 == 0:
				best_of += 1
			meta["rps"] = {
				"best_of": best_of,
				"current_round": 1,
				"phase": "commit",
				"results": [],
			}
		else:
			raise policy.ActivityPolicyError("unsupported_kind")
		meta["options"] = options.model_dump(mode="json") if options else {}
		return meta

	async def _require_activity(self, activity_id: str) -> models.Activity:
		activity = await self._repo.get_activity(activity_id)
		if activity is None:
			raise policy.ActivityPolicyError("activity_not_found", status_code=404)
		return activity

	def _ensure_participant(self, activity: models.Activity, user_id: str) -> None:
		policy.ensure_participant(activity, user_id)

	async def _persist(self, activity: models.Activity) -> None:
		await self._repo.save_activity(activity)

	async def _persist_round(self, round_obj: models.ActivityRound) -> None:
		await self._repo.save_round(round_obj)

	async def _start_typing(self, activity: models.Activity) -> List[models.ActivityRound]:
		typing_meta = activity.meta.get("typing", {})
		duration = int(typing_meta.get("duration_s", 60))
		prompt = prompts.pick_typing()
		typing_meta["prompt"] = prompt
		activity.meta["typing"] = typing_meta
		now = _now()
		close_at = int((now.timestamp() + duration) * 1000)
		round_obj = await self._repo.create_round(
			activity_id=activity.id,
			idx=1,
			state="open",
			meta={"prompt": prompt, "duration_s": duration, "close_at_ms": close_at},
			opened_at=now,
		)
		await timers.set_round_timer(activity.id, 1, duration)
		await sockets.emit_round_open(
			activity.id,
			{
				"activity_id": activity.id,
				"round_idx": 1,
				"prompt": prompt,
				"close_at_ms": close_at,
			},
		)
		return [round_obj]

	async def _start_story(self, activity: models.Activity) -> List[models.ActivityRound]:
		story_meta = activity.meta.get("story", {})
		turns = int(story_meta.get("turns", 6))
		turn_seconds = int(story_meta.get("turn_seconds", 60))
		
		# Preserve previously chosen roles and only generate a scenario if one is missing.
		roles = story_meta.get("roles") or {}
		ready_map = story_meta.get("ready") or {
			activity.user_a: False,
			activity.user_b: False,
		}
		scenario = story_meta.get("scenario") or prompts.pick_romance_scenario()
		activity.meta.setdefault("story", {})
		activity.meta["story"]["scenario"] = scenario
		activity.meta["story"]["roles"] = roles  # user_id -> "boy" | "girl"
		activity.meta["story"]["ready"] = ready_map

		now = _now()
		rounds: List[models.ActivityRound] = []
		for idx in range(1, turns + 1):
			state = "open" if idx == 1 else "pending"
			opened_at = now if idx == 1 else None
			meta = {"turn": idx, "turn_seconds": turn_seconds}
			round_obj = await self._repo.create_round(
				activity_id=activity.id,
				idx=idx,
				state=state,
				meta=meta,
				opened_at=opened_at,
			)
			rounds.append(round_obj)
		
		# We don't start the timer immediately for the first round because we need role selection first?
		# Or we treat role selection as a pre-round phase.
		# For simplicity, let's just start the round but allow role selection during it.
		
		if rounds:
			await timers.set_round_timer(activity.id, 1, turn_seconds)
			await sockets.emit_round_open(
				activity.id,
				{
					"activity_id": activity.id,
					"round_idx": 1,
					"turn_idx": 1,
					"who": "A", # This logic needs to be dynamic based on roles
					"close_at_ms": int((now.timestamp() + turn_seconds) * 1000),
					"scenario": scenario,
				},
			)
		return rounds

	async def _start_trivia(self, activity: models.Activity) -> List[models.ActivityRound]:
		trivia_meta = activity.meta.get("trivia", {})
		per_question = int(trivia_meta.get("per_question_s", 10))
		questions = trivia_meta.get("questions", [])
		rounds: List[models.ActivityRound] = []
		now = _now()
		for idx, question in enumerate(questions, start=1):
			state = "open" if idx == 1 else "pending"
			opened_at = now if idx == 1 else None
			round_obj = await self._repo.create_round(
				activity_id=activity.id,
				idx=idx,
				state=state,
				meta={
					"question_id": question.get("id"),
					"prompt": question.get("prompt"),
					"options": question.get("options"),
					"correct_idx": question.get("correct_idx"),
					"per_question_s": per_question,
				},
				opened_at=opened_at,
			)
			rounds.append(round_obj)
		if rounds:
			await timers.set_round_timer(activity.id, 1, per_question)
			await sockets.emit_round_open(
				activity.id,
				{
					"activity_id": activity.id,
					"round_idx": 1,
					"prompt": rounds[0].meta.get("prompt"),
					"options": rounds[0].meta.get("options"),
					"close_at_ms": int((now.timestamp() + per_question) * 1000),
				},
			)
		return rounds

	async def _start_rps(self, activity: models.Activity) -> List[models.ActivityRound]:
		rps_meta = activity.meta.get("rps", {})
		best_of = int(rps_meta.get("best_of", 3))
		rounds: List[models.ActivityRound] = []
		now = _now()
		for idx in range(1, best_of + 1):
			state = "open" if idx == 1 else "pending"
			opened_at = now if idx == 1 else None
			round_obj = await self._repo.create_round(
				activity_id=activity.id,
				idx=idx,
				state=state,
				meta={"phase": "commit", "commit_close_at_ms": int((now.timestamp() + 10) * 1000)},
				opened_at=opened_at,
			)
			rounds.append(round_obj)
		if rounds:
			rps_meta["current_round"] = 1
			rps_meta["phase"] = "commit"
			await timers.set_round_timer(activity.id, 1, 10)
			await sockets.emit_round_open(
				activity.id,
				{
					"activity_id": activity.id,
					"round_idx": 1,
					"phase": "commit",
					"close_at_ms": int((now.timestamp() + 10) * 1000),
				},
			)
		activity.meta["rps"] = rps_meta
		return rounds

	async def create_activity(
		self,
		auth_user: AuthenticatedUser,
		peer_id: str,
		payload: schemas.CreateActivityRequest,
	) -> schemas.ActivitySummary:
		await policy.enforce_create_limit(auth_user.id)
		await policy.ensure_friends(auth_user.id, peer_id)
		kind = payload.kind
		conversation = ConversationKey.from_participants(auth_user.id, peer_id)
		meta = self._normalize_meta(kind, payload.options, conversation.user_a, conversation.user_b)
		activity = await self._repo.create_activity(
			kind=kind,
			convo_id=conversation.conversation_id,
			user_a=conversation.user_a,
			user_b=conversation.user_b,
			meta=meta,
		)
		summary = _activity_summary(activity)
		await sockets.emit_activity_created(peer_id, summary.model_dump(mode="json"))
		await outbox.append_activity_event(
			"activity_created",
			activity_id=activity.id,
			kind=activity.kind,
			user_id=auth_user.id,
			meta={"peer": peer_id},
		)
		return summary

	async def start_activity(self, auth_user: AuthenticatedUser, activity_id: str) -> schemas.ActivitySummary:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "lobby")
		activity.state = "active"
		activity.started_at = _now()
		rounds: List[models.ActivityRound]
		if activity.kind == "typing_duel":
			rounds = await self._start_typing(activity)
		elif activity.kind == "story_builder":
			rounds = await self._start_story(activity)
		elif activity.kind == "trivia":
			rounds = await self._start_trivia(activity)
		elif activity.kind == "rps":
			rounds = await self._start_rps(activity)
		else:
			raise policy.ActivityPolicyError("unsupported_kind")
		initial_scoreboard = _scoreboard_from_activity(activity)
		await self._populate_scoreboard_participants(activity, initial_scoreboard)
		_store_scoreboard(activity, initial_scoreboard)
		await self._persist(activity)
		for round_obj in rounds:
			await self._persist_round(round_obj)
		summary = _activity_summary(activity)
		await sockets.emit_activity_state(activity.id, summary.model_dump(mode="json"))
		await outbox.append_activity_event(
			"activity_started",
			activity_id=activity.id,
			kind=activity.kind,
			user_id=auth_user.id,
		)
		return summary

	async def get_activity(self, auth_user: AuthenticatedUser, activity_id: str) -> schemas.ActivityDetail:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		rounds = await self._repo.list_rounds(activity.id)
		if activity.kind == "story_builder":
			lines = await self._repo.list_story_lines(activity.id)
			activity.meta.setdefault("story", {})["lines"] = [
				{
					"idx": line.idx,
					"user_id": line.user_id,
					"content": line.content,
					"created_at": line.created_at.isoformat(),
				}
				for line in lines
			]
		summary = _activity_summary(activity)
		detail = schemas.ActivityDetail(**summary.model_dump())
		detail.rounds = [_round_schema(round_obj) for round_obj in rounds]
		return detail

	async def list_my_activities(self, auth_user: AuthenticatedUser) -> List[schemas.ActivitySummary]:
		activities = await self._repo.list_activities_for_user(auth_user.id)
		return [_activity_summary(activity) for activity in activities]

	async def submit_typing(self, auth_user: AuthenticatedUser, payload: schemas.TypingSubmitRequest) -> models.ScoreBoard:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(payload.activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		round_obj = await self._repo.get_round(activity.id, payload.round_idx)
		if round_obj is None:
			raise policy.ActivityPolicyError("round_not_found", status_code=404)
		policy.ensure_round_state(round_obj, "open")
		duration = int(round_obj.meta.get("duration_s", activity.meta.get("typing", {}).get("duration_s", 60)))
		policy.ensure_deadline(round_obj.opened_at, duration)
		submission = models.TypingSubmission(
			round_id=round_obj.id,
			user_id=auth_user.id,
			text=payload.text,
			received_at=_now(),
		)
		await self._repo.upsert_typing_submission(submission)
		submissions = await self._repo.list_typing_submissions(round_obj.id)
		participants = set(activity.participants())
		if {sub.user_id for sub in submissions} == participants:
			scoreboard = _scoreboard_from_activity(activity)
			prompt = round_obj.meta.get("prompt") or activity.meta.get("typing", {}).get("prompt", "")
			for sub in submissions:
				score, _, _ = scoring.typing_stats(prompt, sub.text, duration)
				scoreboard.add_score(round_obj.idx, sub.user_id, score)
			await self._populate_scoreboard_participants(activity, scoreboard)
			_store_scoreboard(activity, scoreboard)
			round_obj.state = "scored"
			round_obj.closed_at = _now()
			await self._persist_round(round_obj)
			activity.state = "completed"
			activity.ended_at = _now()
			await self._persist(activity)
			payload_score = scoreboard.to_payload()
			await sockets.emit_score_update(activity.id, payload_score)
			await sockets.emit_activity_ended(activity.id, {"activity_id": activity.id, "reason": "completed"})
			await outbox.append_score_event(activity_id=activity.id, kind=activity.kind, result=payload_score)
			await outbox.append_activity_event(
				"activity_completed",
				activity_id=activity.id,
				kind=activity.kind,
				user_id=auth_user.id,
			)
			await self._record_leaderboard_outcome(activity, scoreboard)
			return scoreboard
		enriched = _scoreboard_from_activity(activity)
		await self._populate_scoreboard_participants(activity, enriched)
		return enriched

	async def submit_trivia(self, auth_user: AuthenticatedUser, payload: schemas.TriviaAnswerRequest) -> models.ScoreBoard:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(payload.activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		round_obj = await self._repo.get_round(activity.id, payload.round_idx)
		if round_obj is None:
			raise policy.ActivityPolicyError("round_not_found", status_code=404)
		policy.ensure_round_state(round_obj, "open")
		
		answer = models.TriviaAnswer(
			round_id=round_obj.id,
			user_id=auth_user.id,
			choice_idx=payload.choice_idx,
			latency_ms=0,
			created_at=_now(),
		)
		await self._repo.upsert_trivia_answer(answer)
		
		answers = await self._repo.list_trivia_answers(round_obj.id)
		participants = set(activity.participants())
		
		if {ans.user_id for ans in answers} == participants:
			scoreboard = _scoreboard_from_activity(activity)
			correct_idx = int(round_obj.meta.get("correct_idx", -1))
			
			for ans in answers:
				score = 10.0 if ans.choice_idx == correct_idx else 0.0
				scoreboard.add_score(round_obj.idx, ans.user_id, score)
				
			await self._populate_scoreboard_participants(activity, scoreboard)
			_store_scoreboard(activity, scoreboard)
			
			round_obj.state = "scored"
			round_obj.closed_at = _now()
			await self._persist_round(round_obj)
			
			questions = activity.meta.get("trivia", {}).get("questions", [])
			if round_obj.idx >= len(questions):
				activity.state = "completed"
				activity.ended_at = _now()
				await self._persist(activity)
				payload_score = scoreboard.to_payload()
				await sockets.emit_score_update(activity.id, payload_score)
				await sockets.emit_activity_ended(activity.id, {"activity_id": activity.id, "reason": "completed"})
				await outbox.append_score_event(activity_id=activity.id, kind=activity.kind, result=payload_score)
				await outbox.append_activity_event(
					"activity_completed",
					activity_id=activity.id,
					kind=activity.kind,
					user_id=auth_user.id,
				)
				await self._record_leaderboard_outcome(activity, scoreboard)
			else:
				next_idx = round_obj.idx + 1
				next_round = await self._repo.get_round(activity.id, next_idx)
				if next_round:
					next_round.state = "open"
					next_round.opened_at = _now()
					await self._persist_round(next_round)
					per_question = int(activity.meta.get("trivia", {}).get("per_question_s", 10))
					await timers.set_round_timer(activity.id, next_idx, per_question)
					await sockets.emit_round_open(
						activity.id,
						{
							"activity_id": activity.id,
							"round_idx": next_idx,
							"prompt": next_round.meta.get("prompt"),
							"options": next_round.meta.get("options"),
							"close_at_ms": int((_now().timestamp() + per_question) * 1000),
						},
					)
				payload_score = scoreboard.to_payload()
				await sockets.emit_score_update(activity.id, payload_score)
			return scoreboard
			
		enriched = _scoreboard_from_activity(activity)
		await self._populate_scoreboard_participants(activity, enriched)
		return enriched

	async def rps_commit(self, auth_user: AuthenticatedUser, payload: schemas.RpsCommitRequest) -> dict:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(payload.activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		rps_meta = activity.meta.get("rps") or {}
		current_round_idx = int(rps_meta.get("current_round", 1))
		if payload.round_idx != current_round_idx:
			raise policy.ActivityPolicyError("round_out_of_sync", status_code=409)
		round_obj = await self._repo.get_round(activity.id, payload.round_idx)
		if round_obj is None:
			raise policy.ActivityPolicyError("round_not_found", status_code=404)
		policy.ensure_round_state(round_obj, "open")
		if round_obj.meta.get("phase") != "commit":
			raise policy.ActivityPolicyError("invalid_phase", status_code=409)
		move = models.RpsMove(
			round_id=round_obj.id,
			user_id=auth_user.id,
			commit_hash=payload.commit_hash,
			choice=None,
			nonce=None,
			phase="commit",
			created_at=_now(),
		)
		await self._repo.upsert_rps_move(move)
		moves = await self._repo.list_rps_moves(round_obj.id)
		if {mv.user_id for mv in moves if mv.phase == "commit"} == set(activity.participants()):
			round_obj.meta["phase"] = "reveal"
			rps_meta["phase"] = "reveal"
			round_obj.meta["reveal_close_at_ms"] = int((_now().timestamp() + 10) * 1000)
			await self._persist_round(round_obj)
			await timers.set_round_timer(activity.id, payload.round_idx, 10)
			await sockets.emit_rps_phase(
				activity.id,
				{"activity_id": activity.id, "round_idx": payload.round_idx, "phase": "reveal"},
			)
		activity.meta["rps"] = rps_meta
		await self._persist(activity)
		return {"status": "ok"}

	async def rps_reveal(self, auth_user: AuthenticatedUser, payload: schemas.RpsRevealRequest) -> models.ScoreBoard:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(payload.activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		rps_meta = activity.meta.get("rps") or {}
		current_round_idx = int(rps_meta.get("current_round", 1))
		if payload.round_idx != current_round_idx:
			raise policy.ActivityPolicyError("round_out_of_sync", status_code=409)
		round_obj = await self._repo.get_round(activity.id, payload.round_idx)
		if round_obj is None:
			raise policy.ActivityPolicyError("round_not_found", status_code=404)
		policy.ensure_round_state(round_obj, "open")
		if round_obj.meta.get("phase") != "reveal":
			raise policy.ActivityPolicyError("invalid_phase", status_code=409)
		moves = await self._repo.list_rps_moves(round_obj.id)
		move_map = {mv.user_id: mv for mv in moves}
		previous = move_map.get(auth_user.id)
		policy.ensure_commit_exists(previous)
		expected = hashlib.sha256(f"{payload.choice}|{payload.nonce}".encode()).hexdigest()
		if previous.commit_hash != payload.commit_hash or previous.commit_hash != expected:
			raise policy.ActivityPolicyError("commit_mismatch", status_code=409)
		policy.ensure_choice_valid(payload.choice)
		reveal_move = models.RpsMove(
			round_id=round_obj.id,
			user_id=auth_user.id,
			commit_hash=previous.commit_hash,
			choice=payload.choice,
			nonce=payload.nonce,
			phase="reveal",
			created_at=_now(),
		)
		await self._repo.upsert_rps_move(reveal_move)
		moves = await self._repo.list_rps_moves(round_obj.id)
		if {mv.user_id for mv in moves if mv.phase == "reveal"} == set(activity.participants()):
			scoreboard = _scoreboard_from_activity(activity)
			choice_a = next((mv.choice for mv in moves if mv.user_id == activity.user_a), None)
			choice_b = next((mv.choice for mv in moves if mv.user_id == activity.user_b), None)
			if not choice_a or not choice_b:
				raise policy.ActivityPolicyError("missing_reveal", status_code=409)
			result = scoring.rps_round_winner(choice_a, choice_b)
			if result > 0:
				scoreboard.add_score(round_obj.idx, activity.user_a, 1)
				scoreboard.add_score(round_obj.idx, activity.user_b, 0)
				rps_meta.setdefault("results", []).append({"idx": round_obj.idx, "winner": "a"})
			elif result < 0:
				scoreboard.add_score(round_obj.idx, activity.user_a, 0)
				scoreboard.add_score(round_obj.idx, activity.user_b, 1)
				rps_meta.setdefault("results", []).append({"idx": round_obj.idx, "winner": "b"})
			else:
				scoreboard.add_score(round_obj.idx, activity.user_a, 0)
				scoreboard.add_score(round_obj.idx, activity.user_b, 0)
				rps_meta.setdefault("results", []).append({"idx": round_obj.idx, "winner": "draw"})
			await self._populate_scoreboard_participants(activity, scoreboard)
			_store_scoreboard(activity, scoreboard)
			round_obj.state = "scored"
			round_obj.closed_at = _now()
			round_obj.meta["phase"] = "scored"
			await self._persist_round(round_obj)
			best_of = int(rps_meta.get("best_of", 3))
			wins_a = sum(1 for r in rps_meta.get("results", []) if r.get("winner") == "a")
			wins_b = sum(1 for r in rps_meta.get("results", []) if r.get("winner") == "b")
			needed = (best_of // 2) + 1
			payload_score = scoreboard.to_payload()
			await sockets.emit_score_update(activity.id, payload_score)
			if wins_a >= needed or wins_b >= needed or round_obj.idx >= best_of:
				activity.state = "completed"
				activity.ended_at = _now()
				await self._persist(activity)
				rps_meta["phase"] = "done"
				await sockets.emit_activity_ended(activity.id, {"activity_id": activity.id, "reason": "completed"})
				await outbox.append_score_event(activity_id=activity.id, kind=activity.kind, result=payload_score)
				await outbox.append_activity_event(
					"activity_completed",
					activity_id=activity.id,
					kind=activity.kind,
					user_id=auth_user.id,
				)
				await self._record_leaderboard_outcome(activity, scoreboard)
			else:
				next_round_idx = round_obj.idx + 1
				next_round = await self._repo.get_round(activity.id, next_round_idx)
				if next_round:
					next_round.state = "open"
					next_round.opened_at = _now()
					next_round.meta["phase"] = "commit"
					await self._persist_round(next_round)
					now_ts = _now()
					rps_meta["current_round"] = next_round_idx
					rps_meta["phase"] = "commit"
					await timers.set_round_timer(activity.id, next_round_idx, 10)
					await sockets.emit_round_open(
						activity.id,
						{
							"activity_id": activity.id,
							"round_idx": next_round_idx,
							"phase": "commit",
							"close_at_ms": int((now_ts.timestamp() + 10) * 1000),
						},
					)
		activity.meta["rps"] = rps_meta
		await self._persist(activity)
		enriched = _scoreboard_from_activity(activity)
		await self._populate_scoreboard_participants(activity, enriched)
		return enriched

	async def cancel_activity(
		self,
		auth_user: AuthenticatedUser,
		activity_id: str,
		reason: str = "cancelled",
	) -> schemas.ActivitySummary:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		if activity.state in {"completed", "cancelled", "expired"}:
			return _activity_summary(activity)
		if reason not in {"cancelled", "expired"}:
			reason = "cancelled"
		activity.state = reason
		activity.ended_at = _now()
		await self._persist(activity)
		await sockets.emit_activity_ended(activity.id, {"activity_id": activity.id, "reason": reason})
		await outbox.append_activity_event(
			f"activity_{reason}",
			activity_id=activity.id,
			kind=activity.kind,
			user_id=auth_user.id,
		)
		return _activity_summary(activity)

	async def typing_prompt(self, auth_user: AuthenticatedUser, activity_id: str) -> schemas.TypingPromptResponse:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		typing_meta = activity.meta.get("typing") or {}
		prompt = typing_meta.get("prompt") or prompts.pick_typing()
		duration = int(typing_meta.get("duration_s", 60))
		close_at_ms = int((_now().timestamp() + duration) * 1000)
		return schemas.TypingPromptResponse(prompt=prompt, duration_s=duration, close_at_ms=close_at_ms)

	async def reseed_trivia(self, auth_user: AuthenticatedUser, activity_id: str, *, questions: int) -> schemas.ActivitySummary:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		if activity.kind != "trivia":
			raise policy.ActivityPolicyError("wrong_kind", status_code=400)
		if activity.state != "lobby":
			raise policy.ActivityPolicyError("cannot_reseed", status_code=409)
		count = max(1, min(int(questions), 20))
		items = trivia_bank.get_random_items(count)
		per_question = int(activity.meta.get("trivia", {}).get("per_question_s", 10))
		activity.meta["trivia"] = {
			"questions": [
				{
					"id": item.id,
					"prompt": item.prompt,
					"options": list(item.options),
					"correct_idx": item.correct_idx,
				}
				for item in items
			],
			"per_question_s": per_question,
			"latency_totals": {activity.user_a: 0, activity.user_b: 0},
		}
		scoreboard = models.ScoreBoard(activity.id)
		scoreboard.totals = {activity.user_a: 0.0, activity.user_b: 0.0}
		await self._populate_scoreboard_participants(activity, scoreboard)
		_store_scoreboard(activity, scoreboard)
		await self._persist(activity)
		await outbox.append_activity_event(
			"trivia_reseeded",
			activity_id=activity.id,
			kind=activity.kind,
			user_id=auth_user.id,
			meta={"questions": count},
		)
		return _activity_summary(activity)

	async def submit_story(self, auth_user: AuthenticatedUser, payload: schemas.StorySubmitRequest) -> dict:
		await policy.enforce_action_limit(auth_user.id)
		activity = await self._require_activity(payload.activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		story_meta = activity.meta.get("story") or {}
		turns = int(story_meta.get("turns", 6))
		turn_seconds = int(story_meta.get("turn_seconds", 60))
		next_turn = int(story_meta.get("next_turn", 1))
		next_user = story_meta.get("next_user") or activity.user_a
		policy.ensure_turn(story_meta, auth_user.id)
		policy.ensure_story_length(payload.content, int(story_meta.get("max_chars", 400)))
		round_obj = await self._repo.get_round(activity.id, next_turn)
		if round_obj is None:
			raise policy.ActivityPolicyError("round_not_found", status_code=404)
		policy.ensure_round_state(round_obj, "open")
		line = models.StoryLine(
			activity_id=activity.id,
			idx=next_turn,
			user_id=auth_user.id,
			content=payload.content,
			created_at=_now(),
		)
		await self._repo.append_story_line(line)
		await sockets.emit_story_append(
			activity.id,
			{
				"activity_id": activity.id,
				"idx": next_turn,
				"user_id": auth_user.id,
				"content": payload.content,
			},
		)
		round_obj.state = "scored"
		round_obj.closed_at = _now()
		await self._persist_round(round_obj)
		if next_turn >= turns:
			activity.state = "completed"
			activity.ended_at = _now()
			await self._persist(activity)
			await sockets.emit_activity_ended(activity.id, {"activity_id": activity.id, "reason": "completed"})
			await outbox.append_activity_event(
				"activity_completed",
				activity_id=activity.id,
				kind=activity.kind,
				user_id=auth_user.id,
			)
			return {"status": "completed"}
		next_turn += 1
		next_user = models.other_participant(activity, auth_user.id)
		story_meta["next_turn"] = next_turn
		story_meta["next_user"] = next_user
		activity.meta["story"] = story_meta
		await self._persist(activity)
		next_round = await self._repo.get_round(activity.id, next_turn)
		if next_round:
			next_round.state = "open"
			next_round.opened_at = _now()
			next_round.meta["turn"] = next_turn
			await self._persist_round(next_round)
			await timers.set_round_timer(activity.id, next_turn, turn_seconds)
			await sockets.emit_round_open(
				activity.id,
				{
					"activity_id": activity.id,
					"round_idx": next_turn,
					"turn_idx": next_turn,
					"who": "A" if next_user == activity.user_a else "B",
					"close_at_ms": int((_now().timestamp() + turn_seconds) * 1000),
				},
			)
		return {
			"status": "continuing",
			"next_turn": next_turn,
			"next_user": next_user,
		}

	async def set_story_ready(self, auth_user: AuthenticatedUser, activity_id: str, ready: bool) -> schemas.ActivityDetail:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		story_meta = activity.meta.setdefault("story", {})
		ready_map = story_meta.setdefault(
			"ready",
			{
				activity.user_a: False,
				activity.user_b: False,
			},
		)
		roles = story_meta.setdefault("roles", {})
		ready_map[auth_user.id] = ready
		if not ready and roles.get(auth_user.id):
			# Free the role if the player un-readies so the flow always goes Ready -> Role
			roles.pop(auth_user.id, None)
		await self._persist(activity)
		summary = _activity_summary(activity)
		await sockets.emit_activity_state(activity.id, summary.model_dump(mode="json"))
		return await self.get_activity(auth_user, activity_id)

	async def assign_story_role(self, auth_user: AuthenticatedUser, activity_id: str, role: str) -> schemas.ActivityDetail:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		if role not in ("boy", "girl"):
			raise policy.ActivityPolicyError("invalid_role")

		story_meta = activity.meta.setdefault("story", {})
		ready_map = story_meta.setdefault(
			"ready",
			{
				activity.user_a: False,
				activity.user_b: False,
			},
		)
		if not ready_map.get(auth_user.id):
			raise policy.ActivityPolicyError("not_ready")
		if not all(ready_map.get(uid, False) for uid in (activity.user_a, activity.user_b)):
			raise policy.ActivityPolicyError("waiting_for_partner")

		roles = story_meta.setdefault("roles", {})
		
		# Check if role is taken by the OTHER user
		for uid, r in roles.items():
			if r == role and uid != auth_user.id:
				raise policy.ActivityPolicyError("role_taken")
		
		roles[auth_user.id] = role
		await self._persist(activity)

		# If both roles are filled and the match hasn't started, auto-start the story.
		all_roles = set(roles.values())
		if activity.state == "lobby" and {"boy", "girl"}.issubset(all_roles):
			await self.start_activity(auth_user, activity_id)
			return await self.get_activity(auth_user, activity_id)

		# Emit update so clients see the role assignment
		summary = _activity_summary(activity)
		await sockets.emit_activity_state(activity.id, summary.model_dump(mode="json"))

		return await self.get_activity(auth_user, activity_id)

	async def submit_story_turn(self, auth_user: AuthenticatedUser, activity_id: str, content: str) -> schemas.ActivityDetail:
		activity = await self._require_activity(activity_id)
		self._ensure_participant(activity, auth_user.id)
		policy.ensure_state(activity, "active")
		
		roles = activity.meta.get("story", {}).get("roles", {})
		user_role = roles.get(auth_user.id)
		if not user_role:
			raise policy.ActivityPolicyError("role_not_assigned")
			
		# Determine current round
		rounds = await self._repo.list_rounds(activity.id)
		current_round = next((r for r in rounds if r.state == "open"), None)
		if not current_round:
			raise policy.ActivityPolicyError("no_open_round")
			
		# Check turn order
		# Odd rounds = Boy, Even rounds = Girl? Or just alternate?
		# Let's say Round 1 = Boy, Round 2 = Girl, etc.
		# Or we can let the first person to submit claim the round if it's the first one?
		# The prompt says "guy writes for the boy... girl writes for the girl".
		# Let's enforce: Round 1 (Boy), Round 2 (Girl), etc.
		
		expected_role = "boy" if current_round.idx % 2 != 0 else "girl"
		if user_role != expected_role:
			raise policy.ActivityPolicyError("not_your_turn")
			
		# Save the line
		line = models.StoryLine(
			activity_id=activity.id,
			idx=current_round.idx,
			user_id=auth_user.id,
			content=content,
			created_at=_now(),
		)
		await self._repo.append_story_line(line)
		
		# Close current round
		current_round.state = "closed"
		current_round.closed_at = _now()
		await self._persist_round(current_round)
		
		# Open next round if available
		next_round = next((r for r in rounds if r.idx == current_round.idx + 1), None)
		if next_round:
			next_round.state = "open"
			next_round.opened_at = _now()
			await self._persist_round(next_round)
			
			# Reset timer for next round
			turn_seconds = int(activity.meta.get("story", {}).get("turn_seconds", 60))
			await timers.set_round_timer(activity.id, next_round.idx, turn_seconds)
			
			await sockets.emit_round_open(
				activity.id,
				{
					"activity_id": activity.id,
					"round_idx": next_round.idx,
					"turn_idx": next_round.idx,
					"who": "A" if next_round.idx % 2 != 0 else "B", # Simplified
					"close_at_ms": int((_now().timestamp() + turn_seconds) * 1000),
				},
			)
		else:
			# Game over
			activity.state = "completed"
			activity.ended_at = _now()
			await self._persist(activity)
			
		summary = _activity_summary(activity)
		await sockets.emit_activity_state(activity.id, summary.model_dump(mode="json"))
		
		return await self.get_activity(auth_user, activity_id)
