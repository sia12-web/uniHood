"""Policy helpers for rooms & group chat."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from app.domain.rooms import models
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client


class RoomPolicyError(RuntimeError):
	def __init__(self, code: str, *, status_code: int = 400, message: str | None = None) -> None:
		super().__init__(message or code)
		self.code = code
		self.status_code = status_code
		self.detail = message or code


PRESET_CAPACITY: dict[str, int] = {
	"2-4": 4,
	"4-6": 6,
	"12+": 48,
}


def preset_to_capacity(preset: str) -> int:
	try:
		return PRESET_CAPACITY[preset]
	except KeyError as exc:
		raise RoomPolicyError("invalid_preset") from exc


async def _touch_limit(key: str, ttl_seconds: int) -> int:
	async with redis_client.pipeline(transaction=True) as pipe:
		pipe.incr(key)
		pipe.expire(key, ttl_seconds)
		count, _ = await pipe.execute()
	return int(count)


async def enforce_create_limit(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	bucket = now.strftime("%Y%m%d")
	key = f"rl:room:create:{user_id}:{bucket}"
	if await _touch_limit(key, 86_400) > 10:
		raise RoomPolicyError("rate_limited:create", status_code=429)


async def enforce_send_limit(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	bucket = now.strftime("%Y%m%d%H%M")
	key = f"rl:room:send:{user_id}:{bucket}"
	if await _touch_limit(key, 120) > 60:
		raise RoomPolicyError("rate_limited:send", status_code=429)


async def enforce_typing_limit(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	bucket = now.strftime("%Y%m%d%H%M")
	key = f"rl:room:typing:{user_id}:{bucket}"
	if await _touch_limit(key, 120) > 20:
		raise RoomPolicyError("rate_limited:typing", status_code=429)


def ensure_same_campus(user: AuthenticatedUser, campus_id: str) -> None:
	if str(user.campus_id) != str(campus_id):
		raise RoomPolicyError("cross_campus", status_code=403)


def ensure_capacity_available(room: models.Room) -> None:
	if room.members_count >= room.capacity:
		raise RoomPolicyError("capacity_reached", status_code=409)


def ensure_member(member: models.RoomMember | None) -> models.RoomMember:
	if member is None:
		raise RoomPolicyError("not_member", status_code=403)
	return member


def ensure_not_member(member: models.RoomMember | None) -> None:
	if member is not None:
		raise RoomPolicyError("already_member", status_code=409)


def ensure_can_join(room: models.Room, user: AuthenticatedUser) -> None:
	ensure_same_campus(user, room.campus_id)
	if room.is_private():
		raise RoomPolicyError("room_private", status_code=403)
	ensure_capacity_available(room)


def ensure_join_code_room(room: models.Room, user: AuthenticatedUser) -> None:
	ensure_same_campus(user, room.campus_id)
	ensure_capacity_available(room)


def ensure_can_leave(member: models.RoomMember, *, owner_count: int, total_members: int) -> None:
	if member.is_owner() and owner_count <= 1 and total_members > 1:
		raise RoomPolicyError("owner_must_transfer", status_code=409)



def ensure_can_update_role(
	actor: models.RoomMember,
	target: models.RoomMember,
	new_role: str,
	*,
	owner_count: int,
) -> None:
	if not actor.is_owner():
		raise RoomPolicyError("forbidden", status_code=403)
	if target.user_id == actor.user_id and owner_count <= 1 and new_role != "owner":
		raise RoomPolicyError("owner_must_transfer", status_code=409)


def ensure_can_mute(actor: models.RoomMember, target: models.RoomMember) -> None:
	if not actor.can_moderate():
		raise RoomPolicyError("forbidden", status_code=403)
	if target.is_owner():
		raise RoomPolicyError("cannot_target_owner", status_code=403)
	if actor.role == "moderator" and target.role == "moderator":
		raise RoomPolicyError("cannot_target_peer", status_code=403)


def ensure_can_kick(actor: models.RoomMember, target: models.RoomMember) -> None:
	if not actor.can_moderate():
		raise RoomPolicyError("forbidden", status_code=403)
	if target.is_owner():
		raise RoomPolicyError("cannot_target_owner", status_code=403)
	if actor.role == "moderator" and target.role != "member":
		raise RoomPolicyError("cannot_target_peer", status_code=403)


def ensure_not_muted(member: models.RoomMember) -> None:
	if member.muted:
		raise RoomPolicyError("muted", status_code=403)


def count_owners(members: Iterable[models.RoomMember]) -> int:
	return sum(1 for member in members if member.role == "owner")

