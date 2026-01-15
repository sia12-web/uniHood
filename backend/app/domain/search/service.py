"""Service layer for Search & Discovery."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import time
from datetime import datetime, timezone
from uuid import UUID
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Iterable, Optional

import asyncpg
from app.domain.identity import flags as flag_service
from app.domain.search import indexing, models, policy, ranking, schemas
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

logger = logging.getLogger(__name__)

@dataclass(slots=True)
class _CursorState:
	score: float
	entity_id: str


@dataclass(slots=True)
class _BucketCursor:
	score: float
	created_at: datetime
	entity_id: str


def _similarity(a: str, b: str) -> float:
	"""Approximate trigram similarity using SequenceMatcher for in-memory mode."""

	if not a or not b:
		return 0.0
	return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _recent_weight(last_seen_ts: Optional[float], *, now: Optional[float] = None) -> float:
	"""Map presence timestamp (epoch seconds) to a 0..0.4 weight."""

	if last_seen_ts is None:
		return 0.0
	now = now or time.time()
	age = max(0.0, now - last_seen_ts)
	if age <= 60:
		return 0.4
	if age <= 5 * 60:
		return 0.32
	if age <= 30 * 60:
		return 0.2
	if age <= 2 * 60 * 60:
		return 0.1
	return 0.0


def _encode_cursor(score: float, entity_id: str) -> str:
	payload = f"{score:.6f}:{entity_id}"
	return base64.urlsafe_b64encode(payload.encode("ascii")).decode("ascii")


def _decode_cursor(value: str) -> _CursorState:
	try:
		decoded = base64.urlsafe_b64decode(value.encode("ascii")).decode("ascii")
		score_str, entity_id = decoded.split(":", 1)
		return _CursorState(score=float(score_str), entity_id=entity_id)
	except Exception as exc:  # pragma: no cover - defensive guard
		raise policy.SearchPolicyError("bad_cursor", status_code=400) from exc


def _encode_bucket_cursor(cursor: _BucketCursor) -> str:
	payload = {
		"score": cursor.score,
		"created_at": cursor.created_at.isoformat(),
		"id": cursor.entity_id,
	}
	blob = json.dumps(payload, separators=(",", ":"))
	return base64.urlsafe_b64encode(blob.encode("utf-8")).decode("ascii")


def _decode_bucket_cursor(value: str) -> _BucketCursor:
	try:
		decoded = base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
		data = json.loads(decoded)
		return _BucketCursor(
			score=float(data["score"]),
			created_at=datetime.fromisoformat(data["created_at"]),
			entity_id=str(data["id"]),
		)
	except Exception as exc:  # pragma: no cover - defensive guard
		raise policy.SearchPolicyError("bad_cursor", status_code=400) from exc


def _after_cursor(score: float, entity_id: str, cursor: Optional[_CursorState]) -> bool:
	"""Return True when the candidate should appear after the cursor boundary."""

	if cursor is None:
		return True
	if score < cursor.score - 1e-9:
		return True
	if math.isclose(score, cursor.score, abs_tol=1e-9):
		return entity_id > cursor.entity_id
	return False


def _after_bucket_cursor(
	score: float,
	created_at: datetime,
	entity_id: str,
	cursor: Optional[_BucketCursor],
) -> bool:
	"""Keyset comparison for multi-field pagination boundaries."""

	if cursor is None:
		return True
	if score < cursor.score - 1e-9:
		return True
	if math.isclose(score, cursor.score, abs_tol=1e-9):
		if created_at < cursor.created_at:
			return True
		if created_at == cursor.created_at and entity_id < cursor.entity_id:
			return True
	return False


class _MemorySearchStore:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self.users: dict[str, models.MemoryUser] = {}
		self.friendships: set[tuple[str, str]] = set()
		self.blocks: set[tuple[str, str]] = set()
		self.rooms: dict[str, models.MemoryRoom] = {}

	async def reset(self) -> None:
		async with self._lock:
			self.users.clear()
			self.friendships.clear()
			self.blocks.clear()
			self.rooms.clear()

	async def seed(
		self,
		*,
		users: Iterable[models.MemoryUser] | None = None,
		friendships: Iterable[tuple[str, str]] | None = None,
		blocks: Iterable[tuple[str, str]] | None = None,
		rooms: Iterable[models.MemoryRoom] | None = None,
	) -> None:
		async with self._lock:
			self.users = {u.user_id: u for u in users or []}
			self.friendships = set(friendships or [])
			self.blocks = set(blocks or [])
			self.rooms = {room.room_id: room for room in rooms or []}

	def _friends_of(self, user_id: str) -> set[str]:
		friends: set[str] = set()
		for source, target in self.friendships:
			if source == user_id:
				friends.add(target)
		return friends

	async def friends_of(self, user_id: str) -> set[str]:
		async with self._lock:
			return set(self._friends_of(user_id))

	async def blocked_ids(self, user_id: str) -> set[str]:
		async with self._lock:
			blocked: set[str] = set()
			for source, target in self.blocks:
				if source == user_id:
					blocked.add(target)
				if target == user_id:
					blocked.add(source)
			return blocked

	async def get_user(self, user_id: str) -> Optional[models.MemoryUser]:
		async with self._lock:
			return self.users.get(user_id)

	def _blocked(self, a: str, b: str) -> bool:
		return (a, b) in self.blocks or (b, a) in self.blocks

	async def search_users(
		self,
		*,
		me: str,
		campus_id: str,
		query: str,
		limit: int,
	) -> list[models.UserCandidate]:
		async with self._lock:
			friends_me = self._friends_of(me)
			me_user = self.users.get(me)
			location_me = me_user.location_bucket if me_user else None
			results: list[models.UserCandidate] = []
			for candidate in self.users.values():
				if candidate.user_id == me:
					continue
				if candidate.campus_id != campus_id:
					continue
				is_friend = candidate.user_id in friends_me
				friends_candidate = self._friends_of(candidate.user_id)
				mutual_count = len(friends_candidate.intersection(friends_me))
				sim_handle = _similarity(candidate.handle, query)
				sim_display = _similarity(candidate.display_name, query)
				prefix_handle = candidate.handle.lower().startswith(query)
				prefix_display = candidate.display_name.lower().startswith(query)
				exact_match = candidate.handle.lower() == query or candidate.display_name.lower() == query
				blocked = self._blocked(me, candidate.user_id)
				recent_weight = _recent_weight(candidate.last_seen_ts)
				nearby_weight = 0.2 if location_me and candidate.location_bucket == location_me else 0.0
				results.append(
					models.UserCandidate(
						user_id=candidate.user_id,
						handle=candidate.handle,
						display_name=candidate.display_name,
						avatar_url=candidate.avatar_url,
						campus_id=candidate.campus_id,
						visibility=candidate.visibility,
						ghost_mode=candidate.ghost_mode,
						is_friend=is_friend,
						mutual_count=mutual_count,
						similarity_handle=sim_handle,
						similarity_display=sim_display,
						prefix_handle=prefix_handle,
						prefix_display=prefix_display,
						blocked=blocked,
						exact_match=exact_match,
						recent_weight=recent_weight,
						nearby_weight=nearby_weight,
					)
				)
		return results[: limit + 10]

	async def discover_people(
		self,
		*,
		me: str,
		campus_id: str,
		limit: int,
	) -> list[models.UserCandidate]:
		async with self._lock:
			friends_me = self._friends_of(me)
			me_user = self.users.get(me)
			location_me = me_user.location_bucket if me_user else None
			results: list[models.UserCandidate] = []
			for candidate in self.users.values():
				if candidate.user_id == me:
					continue
				if candidate.campus_id != campus_id:
					continue
				sim_handle = 0.0
				friends_candidate = self._friends_of(candidate.user_id)
				mutual_count = len(friends_candidate.intersection(friends_me))
				is_friend = candidate.user_id in friends_me
				blocked = self._blocked(me, candidate.user_id)
				recent_weight = _recent_weight(candidate.last_seen_ts)
				nearby_weight = 0.2 if location_me and candidate.location_bucket == location_me else 0.0
				results.append(
					models.UserCandidate(
						user_id=candidate.user_id,
						handle=candidate.handle,
						display_name=candidate.display_name,
						avatar_url=candidate.avatar_url,
						campus_id=candidate.campus_id,
						visibility=candidate.visibility,
						ghost_mode=candidate.ghost_mode,
						is_friend=is_friend,
						mutual_count=mutual_count,
						similarity_handle=sim_handle,
						similarity_display=sim_handle,
						blocked=blocked,
						recent_weight=recent_weight,
						nearby_weight=nearby_weight,
					)
				)
		return results[: limit + 10]

	async def discover_rooms(
		self,
		*,
		me: str,
		campus_id: str,
		friends_of_me: set[str],
		limit: int,
	) -> list[models.RoomCandidate]:
		async with self._lock:
			results: list[models.RoomCandidate] = []
			for room in self.rooms.values():
				if room.campus_id != campus_id:
					continue
				members_count = len(room.member_ids)
				overlap = len(room.member_ids.intersection(friends_of_me))
				results.append(
					models.RoomCandidate(
						room_id=room.room_id,
						name=room.name,
						preset=room.preset,
						campus_id=room.campus_id,
						visibility=room.visibility,
						members_count=members_count,
						messages_24h=room.messages_24h,
						overlap_count=overlap,
					)
				)
		return results[: limit + 10]


_MEMORY = _MemorySearchStore()


def _prepare_user_response(
	candidates: Iterable[models.UserCandidate],
	*,
	limit: int,
	cursor: Optional[_CursorState],
	normalized_query: str,
) -> schemas.ListResponse[schemas.UserResult]:
	items: list[models.UserCandidate] = []
	for candidate in candidates:
		candidate.exact_match = candidate.handle.lower() == normalized_query or candidate.display_name.lower() == normalized_query
		score = ranking.user_search_score(
			candidate.similarity_handle,
			candidate.similarity_display,
			candidate.prefix_hit(),
			candidate.is_friend,
			candidate.mutual_count,
		)
		candidate.score_hint = score
		items.append(candidate)

	items.sort(key=lambda c: (-(c.score_hint or 0.0), c.user_id))
	page: list[models.UserCandidate] = []
	has_more = False
	for candidate in items:
		score = candidate.score_hint or 0.0
		if not _after_cursor(score, candidate.user_id, cursor):
			continue
		if not policy.allow_user_search(candidate, exact_query=candidate.exact_match):
			continue
		if len(page) < limit:
			page.append(candidate)
		else:
			has_more = True
			break

	next_cursor = None
	if has_more and page:
		last = page[-1]
		next_cursor = _encode_cursor(last.score_hint or 0.0, last.user_id)

	return schemas.ListResponse[schemas.UserResult](
		items=[
			schemas.UserResult(
				user_id=candidate.user_id,
				handle=candidate.handle,
				display_name=candidate.display_name,
				avatar_url=candidate.avatar_url,
				is_friend=candidate.is_friend,
				mutual_count=candidate.mutual_count,
				score=round(candidate.score_hint or 0.0, 6),
			)
			for candidate in page
		],
		cursor=next_cursor,
	)


def _prepare_people_response(
	candidates: Iterable[models.UserCandidate],
	*,
	limit: int,
	cursor: Optional[_CursorState],
) -> schemas.ListResponse[schemas.UserResult]:
	items: list[models.UserCandidate] = []
	for candidate in candidates:
		score = ranking.discover_people_score(candidate.mutual_count, candidate.recent_weight, candidate.nearby_weight)
		candidate.score_hint = score
		items.append(candidate)

	items.sort(key=lambda c: (-(c.score_hint or 0.0), c.user_id))
	page: list[models.UserCandidate] = []
	has_more = False
	for candidate in items:
		score = candidate.score_hint or 0.0
		if candidate.is_friend:
			continue
		if not _after_cursor(score, candidate.user_id, cursor):
			continue
		if not policy.allow_people_discovery(candidate):
			continue
		if len(page) < limit:
			page.append(candidate)
		else:
			has_more = True
			break

	next_cursor = None
	if has_more and page:
		last = page[-1]
		next_cursor = _encode_cursor(last.score_hint or 0.0, last.user_id)

	return schemas.ListResponse[schemas.UserResult](
		items=[
			schemas.UserResult(
				user_id=candidate.user_id,
				handle=candidate.handle,
				display_name=candidate.display_name,
				avatar_url=candidate.avatar_url,
				is_friend=candidate.is_friend,
				mutual_count=candidate.mutual_count,
				score=round(candidate.score_hint or 0.0, 6),
			)
			for candidate in page
		],
		cursor=next_cursor,
	)


def _prepare_room_response(
	candidates: Iterable[models.RoomCandidate],
	*,
	limit: int,
	cursor: Optional[_CursorState],
) -> schemas.ListResponse[schemas.RoomResult]:
	items: list[models.RoomCandidate] = []
	for candidate in candidates:
		score = ranking.discover_room_score(candidate.messages_24h, candidate.members_count, candidate.overlap_count)
		candidate.score_hint = score
		items.append(candidate)

	items.sort(key=lambda c: (-(c.score_hint or 0.0), c.room_id))
	page: list[models.RoomCandidate] = []
	has_more = False
	for candidate in items:
		score = candidate.score_hint or 0.0
		if not policy.allow_room_discovery(candidate.visibility):
			continue
		if not _after_cursor(score, candidate.room_id, cursor):
			continue
		if len(page) < limit:
			page.append(candidate)
		else:
			has_more = True
			break

	next_cursor = None
	if has_more and page:
		last = page[-1]
		next_cursor = _encode_cursor(last.score_hint or 0.0, last.room_id)

	return schemas.ListResponse[schemas.RoomResult](
		items=[
			schemas.RoomResult(
				room_id=candidate.room_id,
				name=candidate.name,
				preset=candidate.preset,
				members_count=candidate.members_count,
				msg_24h=candidate.messages_24h,
				score=round(candidate.score_hint or 0.0, 6),
			)
			for candidate in page
		],
		cursor=next_cursor,
	)


class SearchService:
	def __init__(self) -> None:
		self._pool_checked = False
		self._pool: Optional[asyncpg.Pool] = None
		self._adapter = indexing.resolve_adapter()
		self._search_coeff_cache: dict[str, tuple[float, dict[str, float]]] = {}

	async def _load_flag_payload(self, key: str) -> dict[str, float]:
		flag = await flag_service.get_flag(key)
		if not flag or not isinstance(flag.payload, dict):
			return {}
		return dict(flag.payload)

	async def _search_coefficients(self, *, user_id: str, campus_id: str | None) -> dict[str, float]:
		cache_key = f"{campus_id}:{user_id}"
		cached = self._search_coeff_cache.get(cache_key)
		now = time.time()
		if cached and now - cached[0] < 30.0:
			return cached[1]
		default = {"ts": 0.7, "trgm": 0.3, "recency_tau": 24.0}
		payload = await self._load_flag_payload("search.rank.coeff")
		coeff = default.copy()
		if payload:
			if "ts" in payload:
				coeff["ts"] = float(payload["ts"])
			elif "ts_weight" in payload:
				coeff["ts"] = float(payload["ts_weight"])
			if "trgm" in payload:
				coeff["trgm"] = float(payload["trgm"])
			elif "trgm_weight" in payload:
				coeff["trgm"] = float(payload["trgm_weight"])
			if "recency_tau" in payload:
				coeff["recency_tau"] = float(payload["recency_tau"])
			elif "recency_tau_hours" in payload:
				coeff["recency_tau"] = float(payload["recency_tau_hours"])
		self._search_coeff_cache[cache_key] = (now, coeff)
		return coeff

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

	async def search_users(
		self,
		auth_user: AuthenticatedUser,
		query: schemas.SearchUsersQuery,
	) -> schemas.ListResponse[schemas.UserResult]:
		start = time.perf_counter()
		try:
			await policy.enforce_rate_limit(auth_user.id, kind="search", limit=policy.SEARCH_PER_MINUTE)
			normalized = query.normalized_query()
			limit = min(query.limit, 50)
			if len(normalized) < policy.MIN_QUERY_LEN:
				obs_metrics.inc_search_query("users")
				return schemas.ListResponse[schemas.UserResult](items=[], cursor=None)

			campus_id = str(query.campus_id or auth_user.campus_id)
			cursor = _decode_cursor(query.cursor) if query.cursor else None
			user_id = str(auth_user.id)
			limit_prefetch = limit + 10

			candidates: Optional[list[models.UserCandidate]] = None
			if self._adapter is not None:
				try:
					candidates = await self._adapter.search_users(normalized, campus_id=campus_id, limit=limit_prefetch)
				except NotImplementedError:
					candidates = None

			if candidates is None:
				pool = await self._pool_or_none()
				if pool is None:
					candidates = await _MEMORY.search_users(me=user_id, campus_id=campus_id, query=normalized, limit=limit_prefetch)
				else:
					candidates = await self._search_users_postgres(pool, user_id, campus_id, normalized, limit_prefetch)

			response = _prepare_user_response(candidates, limit=limit, cursor=cursor, normalized_query=normalized)
			obs_metrics.inc_search_query("users")
			logger.info("search.users campus=%s query=%s results=%d", campus_id, normalized[:24], len(response.items))
			return response
		finally:
			obs_metrics.observe_search_latency("users", time.perf_counter() - start)

	async def discover_people(
		self,
		auth_user: AuthenticatedUser,
		query: schemas.DiscoverPeopleQuery,
	) -> schemas.ListResponse[schemas.UserResult]:
		start = time.perf_counter()
		try:
			await policy.enforce_rate_limit(auth_user.id, kind="discover:people", limit=policy.DISCOVERY_PER_MINUTE)
			limit = min(query.limit, 50)
			campus_id = str(query.campus_id or auth_user.campus_id)
			cursor = _decode_cursor(query.cursor) if query.cursor else None
			user_id = str(auth_user.id)
			limit_prefetch = limit + 10

			pool = await self._pool_or_none()
			if pool is None:
				candidates = await _MEMORY.discover_people(me=user_id, campus_id=campus_id, limit=limit_prefetch)
			else:
				candidates = await self._discover_people_postgres(pool, user_id, campus_id, limit_prefetch)

			response = _prepare_people_response(candidates, limit=limit, cursor=cursor)
			obs_metrics.inc_search_query("discover_people")
			logger.info("discover.people campus=%s results=%d", campus_id, len(response.items))
			return response
		finally:
			obs_metrics.observe_search_latency("discover_people", time.perf_counter() - start)

	async def discover_rooms(
		self,
		auth_user: AuthenticatedUser,
		query: schemas.DiscoverRoomsQuery,
	) -> schemas.ListResponse[schemas.RoomResult]:
		start = time.perf_counter()
		try:
			await policy.enforce_rate_limit(auth_user.id, kind="discover:rooms", limit=policy.DISCOVERY_PER_MINUTE)
			limit = min(query.limit, 50)
			campus_id = str(query.campus_id or auth_user.campus_id)
			cursor = _decode_cursor(query.cursor) if query.cursor else None
			user_id = str(auth_user.id)
			limit_prefetch = limit + 10

			pool = await self._pool_or_none()
			if pool is None:
				friends = await _MEMORY.friends_of(user_id)
				candidates = await _MEMORY.discover_rooms(me=user_id, campus_id=campus_id, friends_of_me=friends, limit=limit_prefetch)
			else:
				candidates = await self._discover_rooms_postgres(pool, user_id, campus_id, limit_prefetch)

			response = _prepare_room_response(candidates, limit=limit, cursor=cursor)
			obs_metrics.inc_search_query("discover_rooms")
			logger.info("discover.rooms campus=%s results=%d", campus_id, len(response.items))
			return response
		finally:
			obs_metrics.observe_search_latency("discover_rooms", time.perf_counter() - start)

	async def search_multi(
		self,
		auth_user: AuthenticatedUser,
		query: schemas.MultiSearchQuery,
	) -> schemas.MultiSearchResponse:
		start = time.perf_counter()
		try:
			await policy.enforce_rate_limit(auth_user.id, kind="search:multi", limit=policy.SEARCH_PER_MINUTE)
			normalized = query.q.strip()
			types = self._parse_bucket_types(query.type)
			campus_uuid = query.campus_id or auth_user.campus_id
			campus_str = str(campus_uuid) if campus_uuid else None
			limit_per_bucket = min(query.limit, 20)
			if len(normalized) < policy.MIN_QUERY_LEN:
				return schemas.MultiSearchResponse(
					q=query.q,
					buckets={bucket: schemas.SearchBucket(items=[], next=None) for bucket in types},
				)
			cursor_state: _BucketCursor | None = None
			if query.cursor:
				if len(types) != 1:
					raise policy.SearchPolicyError("cursor_requires_single_type", status_code=400)
				cursor_state = _decode_bucket_cursor(query.cursor)
			coeff = await self._search_coefficients(user_id=str(auth_user.id), campus_id=campus_str)
			buckets: dict[str, schemas.SearchBucket] = {}
			for bucket in types:
				bucket_cursor = cursor_state if cursor_state and len(types) == 1 else None
				bucket_start = time.perf_counter()
				if bucket == "people":
					items, next_cursor = await self._search_people_bucket(
						normalized,
						campus_str,
						limit_per_bucket,
						bucket_cursor,
						coeff,
					)
				elif bucket == "rooms":
					items, next_cursor = await self._search_rooms_bucket(
						normalized,
						campus_str,
						limit_per_bucket,
						bucket_cursor,
						coeff,
					)
				else:
					items, next_cursor = await self._search_posts_bucket(
						normalized,
						campus_str,
						limit_per_bucket,
						bucket_cursor,
						coeff,
					)
				duration_ms = (time.perf_counter() - bucket_start) * 1000.0
				obs_metrics.SEARCH_QUERIES_V2.labels(type=bucket).inc()
				obs_metrics.SEARCH_DURATION_V2.observe(duration_ms)
				obs_metrics.SEARCH_RESULTS_AVG.labels(type=bucket).set(len(items))
				buckets[bucket] = schemas.SearchBucket(items=items, next=next_cursor)
			return schemas.MultiSearchResponse(q=query.q, buckets=buckets)
		finally:
			obs_metrics.observe_search_latency("multi", time.perf_counter() - start)

	@staticmethod
	def _parse_bucket_types(type_param: str | None) -> list[str]:
		allowed = ("people", "rooms", "posts")
		if not type_param:
			return list(allowed)
		seen: list[str] = []
		for raw in type_param.split(","):
			value = raw.strip().lower()
			if value in allowed and value not in seen:
				seen.append(value)
		return seen or list(allowed)

	async def _search_people_bucket(
		self,
		query: str,
		campus_id: str | None,
		limit: int,
		cursor: _BucketCursor | None,
		coeff: dict[str, float],
	) -> tuple[list[dict[str, object]], Optional[str]]:
		pool = await self._pool_or_none()
		if pool is None:
			return [], None
		campus_uuid: UUID | None = None
		if campus_id:
			try:
				campus_uuid = UUID(campus_id)
			except ValueError:
				campus_uuid = None
		limit_prefetch = limit + 1
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				WITH ranked AS (
					SELECT
						u.id,
						u.handle,
						u.display_name,
						u.bio,
						u.campus_id,
						u.created_at,
						ts_rank_cd(
							to_tsvector('english', coalesce(u.display_name,'') || ' ' || coalesce(u.bio,'')),
							websearch_to_tsquery('english', $1)
						) AS ts_score,
						GREATEST(similarity(u.handle, $1), similarity(u.display_name, $1)) AS trgm_score
					FROM users u
					WHERE ($2::uuid IS NULL OR u.campus_id = $2::uuid)
				)
				SELECT *
				FROM ranked
				WHERE ts_score > 0 OR trgm_score > 0.2
				ORDER BY ts_score DESC, trgm_score DESC, created_at DESC, id DESC
				LIMIT $3
				""",
				query,
				campus_uuid,
				limit_prefetch,
			)
		return self._finalize_bucket(rows, limit, cursor, coeff, payload_builder="people")

	async def _search_rooms_bucket(
		self,
		query: str,
		campus_id: str | None,
		limit: int,
		cursor: _BucketCursor | None,
		coeff: dict[str, float],
	) -> tuple[list[dict[str, object]], Optional[str]]:
		pool = await self._pool_or_none()
		if pool is None:
			return [], None
		campus_uuid: UUID | None = None
		if campus_id:
			try:
				campus_uuid = UUID(campus_id)
			except ValueError:
				campus_uuid = None
		limit_prefetch = limit + 1
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				WITH ranked AS (
					SELECT
						r.id,
						r.name,
						r.preset,
						r.campus_id,
						r.created_at,
						ts_rank_cd(
							to_tsvector('english', coalesce(r.name,'')),
							websearch_to_tsquery('english', $1)
						) AS ts_score,
						similarity(r.name, $1) AS trgm_score,
						(SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS members_count,
						(SELECT COUNT(*) FROM room_messages mm WHERE mm.room_id = r.id AND mm.created_at >= NOW() - INTERVAL '24 hours') AS msg_24h
					FROM rooms r
					WHERE ($2::uuid IS NULL OR r.campus_id = $2::uuid)
				)
				SELECT *
				FROM ranked
				WHERE ts_score > 0 OR trgm_score > 0.15
				ORDER BY ts_score DESC, trgm_score DESC, created_at DESC, id DESC
				LIMIT $3
				""",
				query,
				campus_uuid,
				limit_prefetch,
			)
		return self._finalize_bucket(rows, limit, cursor, coeff, payload_builder="rooms")

	async def _search_posts_bucket(
		self,
		query: str,
		campus_id: str | None,
		limit: int,
		cursor: _BucketCursor | None,
		coeff: dict[str, float],
	) -> tuple[list[dict[str, object]], Optional[str]]:
		pool = await self._pool_or_none()
		if pool is None:
			return [], None
		campus_uuid: UUID | None = None
		if campus_id:
			try:
				campus_uuid = UUID(campus_id)
			except ValueError:
				campus_uuid = None
		limit_prefetch = limit + 1
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				WITH ranked AS (
					SELECT
						p.id,
						p.group_id,
						p.author_id,
						p.topic_tags,
						p.created_at,
						ts_rank_cd(
							to_tsvector('english', coalesce(p.body,'')),
							websearch_to_tsquery('english', $1)
						) AS ts_score,
						similarity(coalesce(p.body,''), $1) AS trgm_score
					FROM post p
					JOIN group_entity g ON g.id = p.group_id
					WHERE p.deleted_at IS NULL
						AND p.created_at >= NOW() - INTERVAL '7 days'
						AND ($2::uuid IS NULL OR g.campus_id = $2::uuid)
				)
				SELECT *
				FROM ranked
				WHERE ts_score > 0 OR trgm_score > 0.1
				ORDER BY ts_score DESC, trgm_score DESC, created_at DESC, id DESC
				LIMIT $3
				""",
				query,
				campus_uuid,
				limit_prefetch,
			)
		return self._finalize_bucket(rows, limit, cursor, coeff, payload_builder="posts")

	def _finalize_bucket(
		self,
		rows: Iterable[asyncpg.Record],
		limit: int,
		cursor: _BucketCursor | None,
		coeff: dict[str, float],
		*,
		payload_builder: str,
	) -> tuple[list[dict[str, object]], Optional[str]]:
		recency_tau = max(0.1, float(coeff.get("recency_tau", 24.0)))
		ts_weight = float(coeff.get("ts", 0.7))
		trgm_weight = float(coeff.get("trgm", 0.3))
		now = datetime.now(timezone.utc)
		candidates: list[tuple[float, datetime, str, dict[str, object]]] = []
		for row in rows:
			record = dict(row)
			created_at = record.get("created_at")
			if not isinstance(created_at, datetime):
				continue
			ts_score = float(record.get("ts_score") or 0.0)
			trgm_score = float(record.get("trgm_score") or 0.0)
			age_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
			recency = math.exp(-age_hours / recency_tau)
			score = ts_weight * ts_score + trgm_weight * trgm_score + recency
			entity_id = str(record.get("id"))
			if not entity_id:
				continue
			if not _after_bucket_cursor(score, created_at, entity_id, cursor):
				continue
			payload = self._build_payload(record, payload_builder)
			candidates.append((score, created_at, entity_id, payload))
			if len(candidates) >= limit + 1:
				break
		candidates.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
		items, next_cursor = self._render_bucket(candidates, limit)
		return items, next_cursor

	@staticmethod
	def _build_payload(record: dict[str, object], kind: str) -> dict[str, object]:
		if kind == "people":
			return {
				"id": str(record.get("id")),
				"handle": record.get("handle"),
				"display_name": record.get("display_name"),
				"bio": record.get("bio"),
				"campus_id": str(record.get("campus_id")) if record.get("campus_id") else None,
			}
		if kind == "rooms":
			return {
				"id": str(record.get("id")),
				"name": record.get("name"),
				"preset": record.get("preset"),
				"members_count": int(record.get("members_count") or 0),
				"msg_24h": int(record.get("msg_24h") or 0),
				"campus_id": str(record.get("campus_id")) if record.get("campus_id") else None,
			}
		# posts fallback
		topic_tags = list(record.get("topic_tags") or []) if isinstance(record.get("topic_tags"), list) else []
		return {
			"id": str(record.get("id")),
			"group_id": str(record.get("group_id")) if record.get("group_id") else None,
			"author_id": str(record.get("author_id")) if record.get("author_id") else None,
			"topic_tags": topic_tags,
		}

	@staticmethod
	def _render_bucket(
		candidates: list[tuple[float, datetime, str, dict[str, object]]],
		limit: int,
	) -> tuple[list[dict[str, object]], Optional[str]]:
		items: list[dict[str, object]] = []
		for score, created_at, _entity_id, payload in candidates[:limit]:
			entry = dict(payload)
			entry["score"] = round(float(score), 6)
			entry["created_at"] = created_at.isoformat()
			items.append(entry)
		next_cursor = None
		if len(candidates) > limit:
			score, created_at, entity_id, _ = candidates[limit]
			next_cursor = _encode_bucket_cursor(
				_BucketCursor(score=float(score), created_at=created_at, entity_id=entity_id)
			)
		return items, next_cursor

	async def _load_block_ids(self, conn: asyncpg.Connection, user_id: str) -> set[str]:
		rows = await conn.fetch(
			"""
			SELECT friend_id AS other
			FROM friendships
			WHERE user_id = $1 AND status = 'blocked'
			UNION
			SELECT user_id AS other
			FROM friendships
			WHERE friend_id = $1 AND status = 'blocked'
			""",
			user_id,
		)
		return {str(row["other"]) for row in rows}

	async def _search_users_postgres(
		self,
		pool: asyncpg.Pool,
		user_id: str,
		campus_id: str,
		normalized: str,
		limit_prefetch: int,
	) -> list[models.UserCandidate]:
		async with pool.acquire() as conn:
			blocked = await self._load_block_ids(conn, user_id)
			rows = await conn.fetch(
				"""
				WITH my_friends AS (
					SELECT friend_id
					FROM friendships
					WHERE user_id = $1 AND status = 'accepted'
				)
				SELECT
					u.id,
					u.handle,
					u.display_name,
					u.avatar_url,
					u.campus_id,
					COALESCE(u.privacy->>'visibility', 'everyone') AS visibility,
					COALESCE((u.privacy->>'ghost_mode')::boolean, FALSE) AS ghost_mode,
					EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_id = u.id) AS is_friend,
					COALESCE((
						SELECT COUNT(*)
						FROM friendships f
						WHERE f.user_id = u.id
							AND f.status = 'accepted'
							AND f.friend_id IN (SELECT friend_id FROM my_friends)
					), 0) AS mutual_count,
					similarity(u.handle, $2) AS sim_handle,
					similarity(u.display_name, $2) AS sim_display,
					(lower(u.handle) LIKE $3) AS prefix_handle,
					(lower(u.display_name) LIKE $3) AS prefix_display
				FROM users u
				WHERE u.campus_id = $4
					AND u.id <> $1
					AND (
						u.handle ILIKE $5
						OR u.display_name ILIKE $5
						OR similarity(u.handle, $2) > 0.2
						OR similarity(u.display_name, $2) > 0.2
					)
				ORDER BY GREATEST(similarity(u.handle, $2), similarity(u.display_name, $2)) DESC, u.id
				LIMIT $6
				""",
				user_id,
				normalized,
				normalized + "%",
				campus_id,
				normalized + "%",
				limit_prefetch,
			)
		candidates: list[models.UserCandidate] = []
		for row in rows:
			candidate = models.UserCandidate(
				user_id=str(row["id"]),
				handle=row["handle"],
				display_name=row["display_name"],
				avatar_url=row["avatar_url"],
				campus_id=str(row["campus_id"]),
				visibility=str(row["visibility"] or "everyone"),
				ghost_mode=bool(row["ghost_mode"]),
				is_friend=bool(row["is_friend"]),
				mutual_count=int(row["mutual_count"] or 0),
				similarity_handle=float(row["sim_handle"]),
				similarity_display=float(row["sim_display"]),
				prefix_handle=bool(row["prefix_handle"]),
				prefix_display=bool(row["prefix_display"]),
				blocked=str(row["id"]) in blocked,
			)
			candidates.append(candidate)
		return candidates

	async def _discover_people_postgres(
		self,
		pool: asyncpg.Pool,
		user_id: str,
		campus_id: str,
		limit_prefetch: int,
	) -> list[models.UserCandidate]:
		async with pool.acquire() as conn:
			blocked = await self._load_block_ids(conn, user_id)
			rows = await conn.fetch(
				"""
				WITH my_friends AS (
					SELECT friend_id
					FROM friendships
					WHERE user_id = $1 AND status = 'accepted'
				)
				SELECT
					u.id,
					u.handle,
					u.display_name,
					u.avatar_url,
					u.campus_id,
					COALESCE(u.privacy->>'visibility', 'everyone') AS visibility,
					COALESCE((u.privacy->>'ghost_mode')::boolean, FALSE) AS ghost_mode,
					EXISTS (SELECT 1 FROM my_friends mf WHERE mf.friend_id = u.id) AS is_friend,
					COALESCE((
						SELECT COUNT(*)
						FROM friendships f
						WHERE f.user_id = u.id
							AND f.status = 'accepted'
							AND f.friend_id IN (SELECT friend_id FROM my_friends)
					), 0) AS mutual_count
				FROM users u
				WHERE u.campus_id = $2
					AND u.id <> $1
				ORDER BY mutual_count DESC, u.id
				LIMIT $3
				""",
				user_id,
				campus_id,
				limit_prefetch,
			)

		candidate_ids = [str(row["id"]) for row in rows]
		presence = await self._presence_snapshot([user_id, *candidate_ids])
		me_presence = presence.get(user_id, {})
		me_bucket = (me_presence.get("venue_id") or "") if isinstance(me_presence, dict) else ""

		candidates: list[models.UserCandidate] = []
		for row in rows:
			uid = str(row["id"])
			presence_row = presence.get(uid, {}) if isinstance(presence.get(uid), dict) else {}
			ts_raw = presence_row.get("ts") if isinstance(presence_row, dict) else None
			last_seen = float(ts_raw) / 1000.0 if ts_raw else None
			venue = presence_row.get("venue_id") if isinstance(presence_row, dict) else None
			candidate = models.UserCandidate(
				user_id=uid,
				handle=row["handle"],
				display_name=row["display_name"],
				avatar_url=row["avatar_url"],
				campus_id=str(row["campus_id"]),
				visibility=str(row["visibility"] or "everyone"),
				ghost_mode=bool(row["ghost_mode"]),
				is_friend=bool(row["is_friend"]),
				mutual_count=int(row["mutual_count"] or 0),
				similarity_handle=0.0,
				similarity_display=0.0,
				blocked=uid in blocked,
				recent_weight=_recent_weight(last_seen) if last_seen else 0.0,
				nearby_weight=0.2 if me_bucket and venue and venue == me_bucket else 0.0,
			)
			candidates.append(candidate)
		return candidates

	async def _discover_rooms_postgres(
		self,
		pool: asyncpg.Pool,
		user_id: str,
		campus_id: str,
		limit_prefetch: int,
	) -> list[models.RoomCandidate]:
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				WITH my_friends AS (
					SELECT friend_id
					FROM friendships
					WHERE user_id = $1 AND status = 'accepted'
				)
				SELECT
					r.id,
					r.name,
					r.preset,
					r.campus_id,
					r.visibility,
					(SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS members_count,
					(
						SELECT COUNT(*)
						FROM room_messages msg
						WHERE msg.room_id = r.id AND msg.created_at >= NOW() - INTERVAL '24 hours'
					) AS messages_24h,
					(
						SELECT COUNT(*)
						FROM room_members rm
						WHERE rm.room_id = r.id AND rm.user_id IN (SELECT friend_id FROM my_friends)
					) AS overlap_count
				FROM rooms r
				WHERE r.campus_id = $2 AND r.visibility = 'link'
				ORDER BY messages_24h DESC, members_count DESC, r.id
				LIMIT $3
				""",
				user_id,
				campus_id,
				limit_prefetch,
			)
		candidates: list[models.RoomCandidate] = []
		for row in rows:
			candidates.append(
				models.RoomCandidate(
					room_id=str(row["id"]),
					name=row["name"],
					preset=row["preset"],
					campus_id=str(row["campus_id"]),
					visibility=str(row["visibility"] or "link"),
					members_count=int(row["members_count"] or 0),
					messages_24h=int(row["messages_24h"] or 0),
					overlap_count=int(row["overlap_count"] or 0),
				)
			)
		return candidates

	async def _presence_snapshot(self, user_ids: Iterable[str]) -> dict[str, dict[str, str]]:
		ids = list({str(uid) for uid in user_ids})
		if not ids:
			return {}
		async with redis_client.pipeline(transaction=True) as pipe:
			for uid in ids:
				pipe.hgetall(f"presence:{uid}")
			raw = await pipe.execute()
		snapshot: dict[str, dict[str, str]] = {}
		for uid, data in zip(ids, raw):
			if isinstance(data, dict):
				snapshot[uid] = data
			else:
				snapshot[uid] = {}
		return snapshot


async def seed_memory_store(
	*,
	users: Iterable[models.MemoryUser] | None = None,
	friendships: Iterable[tuple[str, str]] | None = None,
	blocks: Iterable[tuple[str, str]] | None = None,
	rooms: Iterable[models.MemoryRoom] | None = None,
) -> None:
	await _MEMORY.seed(users=users, friendships=friendships, blocks=blocks, rooms=rooms)


async def reset_memory_state() -> None:
	await _MEMORY.reset()
