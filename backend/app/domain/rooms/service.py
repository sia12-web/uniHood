"""Room lifecycle service layer."""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

import asyncpg
import ulid

from app.domain.rooms import models, outbox, policy, schemas, sockets
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


class _MemoryStore:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self.rooms: Dict[str, models.Room] = {}
		self.members: Dict[str, Dict[str, models.RoomMember]] = {}

	async def create_room(self, room: models.Room, member: models.RoomMember) -> models.Room:
		async with self._lock:
			self.rooms[room.id] = room
			self.members[room.id] = {member.user_id: member}
			return room

	async def get_room(self, room_id: str) -> Optional[models.Room]:
		async with self._lock:
			room = self.rooms.get(room_id)
			if room:
				members = self.members.get(room_id, {})
				room.members_count = len(members)
			return room

	async def list_members(self, room_id: str) -> List[models.RoomMember]:
		async with self._lock:
			return list(self.members.get(room_id, {}).values())

	async def get_member(self, room_id: str, user_id: str) -> Optional[models.RoomMember]:
		async with self._lock:
			return self.members.get(room_id, {}).get(user_id)

	async def add_member(self, room: models.Room, member: models.RoomMember) -> None:
		async with self._lock:
			members = self.members.setdefault(room.id, {})
			members[member.user_id] = member
			room.members_count = len(members)
			self.rooms[room.id] = room

	async def remove_member(self, room: models.Room, user_id: str) -> None:
		async with self._lock:
			members = self.members.setdefault(room.id, {})
			members.pop(user_id, None)
			room.members_count = len(members)
			self.rooms[room.id] = room

	async def update_member(self, room_id: str, member: models.RoomMember) -> None:
		async with self._lock:
			members = self.members.setdefault(room_id, {})
			members[member.user_id] = member

	async def list_rooms_for_user(self, user_id: str) -> List[models.Room]:
		async with self._lock:
			result: List[models.Room] = []
			for room in self.rooms.values():
				if user_id in self.members.get(room.id, {}):
					room_copy = models.Room(**asdict(room))
					room_copy.members_count = len(self.members.get(room.id, {}))
					result.append(room_copy)
			return result

	async def get_room_by_code(self, join_code: str) -> Optional[models.Room]:
		async with self._lock:
			for room in self.rooms.values():
				if room.join_code == join_code:
					room.members_count = len(self.members.get(room.id, {}))
					return room
			return None

	async def update_join_code(self, room_id: str, join_code: Optional[str]) -> Optional[str]:
		async with self._lock:
			room = self.rooms.get(room_id)
			if not room:
				return None
			room.join_code = join_code
			self.rooms[room_id] = room
			return join_code

	async def count_role(self, room_id: str, role: str) -> int:
		async with self._lock:
			members = self.members.get(room_id, {})
			return sum(1 for m in members.values() if m.role == role)

	async def total_members(self, room_id: str) -> int:
		async with self._lock:
			return len(self.members.get(room_id, {}))

	async def set_room(self, room: models.Room) -> None:
		async with self._lock:
			self.rooms[room.id] = room

	async def list_room_ids(self) -> List[str]:
		async with self._lock:
			return list(self.rooms.keys())


_MEMORY = _MemoryStore()


class RoomRepository:
	def __init__(self) -> None:
		self._pool_checked = False
		self._pool_instance: Optional[asyncpg.Pool] = None

	async def _get_pool(self) -> Optional[asyncpg.Pool]:
		if self._pool_checked:
			return self._pool_instance
		self._pool_checked = True
		try:
			pool = await get_pool()
		except AssertionError:
			pool = None
		except Exception:
			pool = None
		self._pool_instance = pool
		return pool

	async def create_room(
		self,
		*,
		campus_id: str,
		owner_id: str,
		name: str,
		preset: str,
		visibility: str,
		join_code: Optional[str],
		capacity: int,
	) -> models.Room:
		now = datetime.now(timezone.utc)
		room = models.Room(
			id=str(ulid.new()),
			campus_id=campus_id,
			owner_id=owner_id,
			name=name,
			preset=preset,
			visibility=visibility,
			capacity=capacity,
			join_code=join_code,
			created_at=now,
			updated_at=now,
			members_count=1,
		)
		member = models.RoomMember(
			room_id=room.id,
			user_id=owner_id,
			role="owner",
			muted=False,
			joined_at=now,
		)
		pool = await self._get_pool()
		if pool is None:
			await _MEMORY.create_room(room, member)
			return room
		async with pool.acquire() as conn:
			async with conn.transaction():
				await conn.execute(
					"""
					INSERT INTO rooms (id, campus_id, owner_id, name, preset, visibility, join_code, capacity)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
					""",
					room.id,
					campus_id,
					owner_id,
					name,
					preset,
					visibility,
					join_code,
					capacity,
				)
				await conn.execute(
					"""
					INSERT INTO room_members (room_id, user_id, role, muted)
					VALUES ($1,$2,'owner',FALSE)
					""",
					room.id,
					owner_id,
				)
			return room

	async def get_room(self, room_id: str) -> Optional[models.Room]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.get_room(room_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"SELECT *, (SELECT COUNT(*) FROM room_members WHERE room_id=$1) AS members_count FROM rooms WHERE id=$1",
				room_id,
			)
			if not row:
				return None
			return _row_to_room(row)

	async def get_room_by_code(self, join_code: str) -> Optional[models.Room]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.get_room_by_code(join_code)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				SELECT *, (SELECT COUNT(*) FROM room_members WHERE room_id=rooms.id) AS members_count
				FROM rooms
				WHERE join_code = $1
				""",
				join_code,
			)
			return _row_to_room(row) if row else None

	async def list_rooms_for_user(self, user_id: str) -> List[models.Room]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.list_rooms_for_user(user_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT r.*, COUNT(m2.user_id) AS members_count
				FROM rooms r
				JOIN room_members m ON m.room_id = r.id AND m.user_id = $1
				LEFT JOIN room_members m2 ON m2.room_id = r.id
				GROUP BY r.id
				ORDER BY r.created_at DESC
				""",
				user_id,
			)
			return [_row_to_room(row) for row in rows]

	async def get_member(self, room_id: str, user_id: str) -> Optional[models.RoomMember]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.get_member(room_id, user_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"SELECT * FROM room_members WHERE room_id=$1 AND user_id=$2",
				room_id,
				user_id,
			)
			return _row_to_member(row) if row else None

	async def list_members(self, room_id: str) -> List[models.RoomMember]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.list_members(room_id)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"SELECT * FROM room_members WHERE room_id=$1 ORDER BY joined_at",
				room_id,
			)
			return [_row_to_member(row) for row in rows]

	async def add_member(self, room: models.Room, member: models.RoomMember) -> None:
		pool = await self._get_pool()
		if pool is None:
			await _MEMORY.add_member(room, member)
			return
		async with pool.acquire() as conn:
			async with conn.transaction():
				await conn.execute(
					"""
					INSERT INTO room_members (room_id, user_id, role, muted)
					VALUES ($1,$2,$3,$4)
					""",
					member.room_id,
					member.user_id,
					member.role,
					member.muted,
				)

	async def remove_member(self, room: models.Room, user_id: str) -> None:
		pool = await self._get_pool()
		if pool is None:
			await _MEMORY.remove_member(room, user_id)
			return
		async with pool.acquire() as conn:
			await conn.execute("DELETE FROM room_members WHERE room_id=$1 AND user_id=$2", room.id, user_id)

	async def update_member(self, member: models.RoomMember) -> None:
		pool = await self._get_pool()
		if pool is None:
			await _MEMORY.update_member(member.room_id, member)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				UPDATE room_members
				SET role=$3, muted=$4
				WHERE room_id=$1 AND user_id=$2
				""",
				member.room_id,
				member.user_id,
				member.role,
				member.muted,
			)

	async def total_members(self, room_id: str) -> int:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.total_members(room_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM room_members WHERE room_id=$1", room_id)
			return int(row["cnt"]) if row else 0

	async def count_role(self, room_id: str, role: str) -> int:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.count_role(room_id, role)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"SELECT COUNT(*) AS cnt FROM room_members WHERE room_id=$1 AND role=$2",
				room_id,
				role,
			)
			return int(row["cnt"]) if row else 0

	async def rotate_join_code(self, room_id: str, join_code: Optional[str]) -> Optional[str]:
		pool = await self._get_pool()
		if pool is None:
			return await _MEMORY.update_join_code(room_id, join_code)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				UPDATE rooms
				SET join_code=$2, updated_at=NOW()
				WHERE id=$1
				RETURNING join_code
				""",
				room_id,
				join_code,
			)
			return row["join_code"] if row else None


def _row_to_room(row: asyncpg.Record) -> models.Room:
	return models.Room(
		id=str(row["id"]),
		campus_id=str(row["campus_id"]),
		owner_id=str(row["owner_id"]),
		name=row["name"],
		preset=row["preset"],
		visibility=row["visibility"],
		capacity=int(row["capacity"]),
		join_code=row["join_code"],
		created_at=row["created_at"],
		updated_at=row["updated_at"],
		members_count=int(row.get("members_count", 0)),
	)


def _row_to_member(row: asyncpg.Record) -> models.RoomMember:
	return models.RoomMember(
		room_id=str(row["room_id"]),
		user_id=str(row["user_id"]),
		role=row["role"],
		muted=bool(row["muted"]),
		joined_at=row["joined_at"],
	)


class RoomService:
	def __init__(self, repository: RoomRepository | None = None) -> None:
		self._repo = repository or RoomRepository()

	async def create_room(self, auth_user: AuthenticatedUser, payload: schemas.RoomCreateRequest) -> schemas.RoomSummary:
		await policy.enforce_create_limit(auth_user.id)
		capacity = policy.preset_to_capacity(payload.preset)
		join_code = str(ulid.new()) if payload.visibility == "link" else None
		campus_id = payload.campus_id or auth_user.campus_id
		policy.ensure_same_campus(auth_user, campus_id)
		room = await self._repo.create_room(
			campus_id=campus_id,
			owner_id=auth_user.id,
			name=payload.name,
			preset=payload.preset,
			visibility=payload.visibility,
			join_code=join_code,
			capacity=capacity,
		)
		summary = schemas.RoomSummary(
			**room.to_summary("owner", join_code, include_join_code=True)
		)
		await sockets.emit_room_created(auth_user.id, summary.model_dump(mode="json"))
		await outbox.append_room_event("room_created", room.id, user_id=auth_user.id)
		obs_metrics.inc_room_created()
		return summary

	async def rotate_join_code(self, auth_user: AuthenticatedUser, room_id: str) -> schemas.RotateInviteResponse:
		room = await self._require_room(room_id)
		member = await self._require_member(room_id, auth_user.id)
		if not member.is_owner():
			raise policy.RoomPolicyError("forbidden", status_code=403)
		new_code = str(ulid.new()) if room.visibility == "link" else None
		await self._repo.rotate_join_code(room_id, new_code)
		room.join_code = new_code
		summary = schemas.RoomSummary(
			**room.to_summary(
				member.role,
				new_code,
				include_join_code=True,
			)
		)
		await sockets.emit_room_updated(room.id, summary.model_dump(mode="json"))
		await outbox.append_room_event("join_code_rotated", room_id, user_id=auth_user.id)
		return schemas.RotateInviteResponse(join_code=new_code)

	async def join_by_code(self, auth_user: AuthenticatedUser, payload: schemas.JoinByCodeRequest) -> schemas.RoomSummary:
		room = await self._repo.get_room_by_code(payload.join_code)
		if room is None:
			raise policy.RoomPolicyError("room_not_found", status_code=404)
		policy.ensure_join_code_room(room, auth_user)
		existing = await self._repo.get_member(room.id, auth_user.id)
		policy.ensure_not_member(existing)
		now = datetime.now(timezone.utc)
		member = models.RoomMember(
			room_id=room.id,
			user_id=auth_user.id,
			role="member",
			muted=False,
			joined_at=now,
		)
		await self._repo.add_member(room, member)
		room.members_count += 1
		await outbox.append_room_event("member_joined", room.id, user_id=auth_user.id)
		obs_metrics.inc_room_join()
		await sockets.emit_member_event(
			"room:member_joined",
			room.id,
			{"room_id": room.id, "user_id": auth_user.id, "role": member.role},
		)
		return schemas.RoomSummary(
			**room.to_summary(member.role, room.join_code, include_join_code=False)
		)

	async def join_room(self, auth_user: AuthenticatedUser, room_id: str) -> schemas.RoomSummary:
		room = await self._require_room(room_id)
		policy.ensure_can_join(room, auth_user)
		existing = await self._repo.get_member(room_id, auth_user.id)
		policy.ensure_not_member(existing)
		now = datetime.now(timezone.utc)
		member = models.RoomMember(
			room_id=room_id,
			user_id=auth_user.id,
			role="member",
			muted=False,
			joined_at=now,
		)
		await self._repo.add_member(room, member)
		room.members_count += 1
		await outbox.append_room_event("member_joined_direct", room_id, user_id=auth_user.id)
		obs_metrics.inc_room_join()
		await sockets.emit_member_event(
			"room:member_joined",
			room_id,
			{"room_id": room_id, "user_id": auth_user.id, "role": member.role},
		)
		return schemas.RoomSummary(
			**room.to_summary(member.role, room.join_code, include_join_code=False)
		)

	async def leave_room(self, auth_user: AuthenticatedUser, room_id: str) -> None:
		room = await self._require_room(room_id)
		member = await self._require_member(room_id, auth_user.id)
		owners = await self._repo.count_role(room_id, "owner")
		total = await self._repo.total_members(room_id)
		policy.ensure_can_leave(member, owner_count=owners, total_members=total)
		await self._repo.remove_member(room, auth_user.id)
		room.members_count = max(room.members_count - 1, 0)
		await outbox.append_room_event("member_left", room_id, user_id=auth_user.id)
		await sockets.emit_member_event(
			"room:member_left",
			room_id,
			{"room_id": room_id, "user_id": auth_user.id},
		)

	async def list_my_rooms(self, auth_user: AuthenticatedUser) -> List[schemas.RoomSummary]:
		rooms = await self._repo.list_rooms_for_user(auth_user.id)
		summaries: List[schemas.RoomSummary] = []
		for room in rooms:
			member = await self._repo.get_member(room.id, auth_user.id)
			role = member.role if member else "member"
			summaries.append(
				schemas.RoomSummary(
					**room.to_summary(
						role,
						room.join_code,
						include_join_code=bool(member and member.is_owner()),
					)
				)
			)
		return summaries

	async def get_room(self, auth_user: AuthenticatedUser, room_id: str) -> schemas.RoomDetail:
		room = await self._require_room(room_id)
		member = await self._require_member(room_id, auth_user.id)
		members = await self._repo.list_members(room_id)
		items = [
			schemas.RoomMemberSummary(
				user_id=m.user_id,
				role=m.role,
				muted=m.muted,
				joined_at=m.joined_at,
			)
			for m in members
		]
		return schemas.RoomDetail(
			**room.to_summary(
				member.role,
				room.join_code,
				include_join_code=member.is_owner(),
			),
			members=items,
		)

	async def update_role(
		self,
		auth_user: AuthenticatedUser,
		room_id: str,
		target_user_id: str,
		payload: schemas.RoleUpdateRequest,
	) -> None:
		room = await self._require_room(room_id)
		actor = await self._require_member(room_id, auth_user.id)
		target = await self._require_member(room_id, target_user_id)
		owners = await self._repo.count_role(room_id, "owner")
		policy.ensure_can_update_role(actor, target, payload.role, owner_count=owners)
		target.role = payload.role
		await self._repo.update_member(target)
		await sockets.emit_member_event(
			"room:member_updated",
			room_id,
			{"room_id": room.id, "user_id": target_user_id, "role": payload.role, "muted": target.muted},
		)
		await outbox.append_room_event("member_role_updated", room_id, user_id=target_user_id, meta={"role": payload.role})

	async def mute_member(
		self,
		auth_user: AuthenticatedUser,
		room_id: str,
		target_user_id: str,
		payload: schemas.MuteRequest,
	) -> None:
		room = await self._require_room(room_id)
		actor = await self._require_member(room_id, auth_user.id)
		target = await self._require_member(room_id, target_user_id)
		policy.ensure_can_mute(actor, target)
		target.muted = payload.on
		await self._repo.update_member(target)
		event_payload = {
			"room_id": room.id,
			"user_id": target_user_id,
			"role": target.role,
			"muted": payload.on,
		}
		await sockets.emit_member_event("room:member_updated", room_id, event_payload)
		await outbox.append_room_event("member_muted", room_id, user_id=target_user_id, meta={"muted": payload.on})

	async def kick_member(self, auth_user: AuthenticatedUser, room_id: str, target_user_id: str) -> None:
		room = await self._require_room(room_id)
		actor = await self._require_member(room_id, auth_user.id)
		target = await self._require_member(room_id, target_user_id)
		policy.ensure_can_kick(actor, target)
		await self._repo.remove_member(room, target_user_id)
		room.members_count = max(room.members_count - 1, 0)
		await sockets.emit_member_event(
			"room:member_left",
			room_id,
			{"room_id": room.id, "user_id": target_user_id},
		)
		await outbox.append_room_event("member_kicked", room_id, user_id=target_user_id)

	async def _require_room(self, room_id: str) -> models.Room:
		room = await self._repo.get_room(room_id)
		if room is None:
			raise policy.RoomPolicyError("room_not_found", status_code=404)
		return room

	async def _require_member(self, room_id: str, user_id: str) -> models.RoomMember:
		member = await self._repo.get_member(room_id, user_id)
		return policy.ensure_member(member)


async def reset_memory_state() -> None:
	"""Test helper to clear in-memory store state."""
	async with _MEMORY._lock:  # type: ignore[attr-defined]
		_MEMORY.rooms.clear()
		_MEMORY.members.clear()

