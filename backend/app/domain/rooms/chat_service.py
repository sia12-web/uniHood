"""Room chat message handling."""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple

import asyncpg
import ulid

from app.domain.rooms import attachments, models, outbox, policy, schemas, service, sockets
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool


class _MessageStore:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self.messages: Dict[str, List[models.RoomMessage]] = {}
		self.client_index: Dict[Tuple[str, str], models.RoomMessage] = {}
		self.receipts: Dict[Tuple[str, str], models.RoomReceipt] = {}

	async def get_or_create_receipt(self, room_id: str, user_id: str) -> models.RoomReceipt:
		async with self._lock:
			key = (room_id, user_id)
			receipt = self.receipts.get(key)
			if receipt is None:
				receipt = models.RoomReceipt(
					room_id=room_id,
					user_id=user_id,
					delivered_seq=0,
					read_seq=0,
					updated_at=datetime.now(timezone.utc),
				)
				self.receipts[key] = receipt
			return receipt

	async def store_message(self, message: models.RoomMessage) -> models.RoomMessage:
		async with self._lock:
			messages = self.messages.setdefault(message.room_id, [])
			messages.append(message)
			self.client_index[(message.room_id, message.client_msg_id)] = message
			return message

	async def next_sequence(self, room_id: str) -> int:
		async with self._lock:
			messages = self.messages.get(room_id, [])
			return messages[-1].seq + 1 if messages else 1

	async def get_by_client(self, room_id: str, client_msg_id: str) -> Optional[models.RoomMessage]:
		async with self._lock:
			return self.client_index.get((room_id, client_msg_id))

	async def list_messages(self, room_id: str) -> List[models.RoomMessage]:
		async with self._lock:
			return list(self.messages.get(room_id, []))

	async def update_delivered(self, room_id: str, user_id: str, seq: int) -> int:
		receipt = await self.get_or_create_receipt(room_id, user_id)
		receipt.delivered_seq = max(receipt.delivered_seq, seq)
		receipt.updated_at = datetime.now(timezone.utc)
		return receipt.delivered_seq

	async def update_read(self, room_id: str, user_id: str, seq: int) -> int:
		receipt = await self.get_or_create_receipt(room_id, user_id)
		receipt.read_seq = max(receipt.read_seq, seq)
		receipt.updated_at = datetime.now(timezone.utc)
		return receipt.read_seq

	async def get_receipt(self, room_id: str, user_id: str) -> models.RoomReceipt:
		return await self.get_or_create_receipt(room_id, user_id)


_STORE = _MessageStore()


def _encode_cursor(room_id: str, seq: int) -> str:
	value = f"{room_id}:{seq}".encode()
	return base64.b64encode(value).decode()


def _decode_cursor(cursor: Optional[str]) -> Tuple[Optional[str], Optional[int]]:
	if not cursor:
		return None, None
	decoded = base64.b64decode(cursor.encode()).decode()
	room_id, seq_str = decoded.split(":", 1)
	return room_id, int(seq_str)


def _row_to_message(row: asyncpg.Record) -> models.RoomMessage:
	return models.RoomMessage(
		id=str(row["id"]),
		room_id=str(row["room_id"]),
		seq=int(row["seq"]),
		sender_id=str(row["sender_id"]),
		client_msg_id=str(row["client_msg_id"]),
		kind=row["kind"],
		content=row["content"],
		media_key=row["media_key"],
		media_mime=row["media_mime"],
		media_bytes=row["media_bytes"],
		created_at=row["created_at"],
	)


class RoomChatRepository:
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

	async def persist_message(
		self,
		*,
		room_id: str,
		sender_id: str,
		payload: schemas.RoomMessageSendRequest,
		members: Sequence[models.RoomMember],
	) -> models.RoomMessage:
		pool = await self._get_pool()
		if pool is None:
			existing = await _STORE.get_by_client(room_id, payload.client_msg_id)
			if existing:
				return existing
			seq = await _STORE.next_sequence(room_id)
			message = models.RoomMessage(
				id=str(ulid.new()),
				room_id=room_id,
				seq=seq,
				sender_id=sender_id,
				client_msg_id=payload.client_msg_id,
				kind=payload.kind,
				content=payload.content,
				media_key=payload.media_key,
				media_mime=payload.media_mime,
				media_bytes=payload.media_bytes,
				created_at=datetime.now(timezone.utc),
			)
			await _STORE.store_message(message)
			for member in members:
				await _STORE.get_or_create_receipt(room_id, member.user_id)
			return message
		async with pool.acquire() as conn:
			async with conn.transaction():
				existing = await conn.fetchrow(
					"SELECT * FROM room_messages WHERE room_id=$1 AND client_msg_id=$2",
					room_id,
					payload.client_msg_id,
				)
				if existing:
					return _row_to_message(existing)
				last_row = await conn.fetchrow(
					"SELECT seq FROM room_messages WHERE room_id=$1 ORDER BY seq DESC LIMIT 1 FOR UPDATE",
					room_id,
				)
				next_seq = int(last_row["seq"]) + 1 if last_row else 1
				message_id = str(ulid.new())
				row = await conn.fetchrow(
					"""
					INSERT INTO room_messages (
						id, room_id, seq, sender_id, client_msg_id, kind, content, media_key, media_mime, media_bytes
					)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
					RETURNING *
					""",
					message_id,
					room_id,
					next_seq,
					sender_id,
					payload.client_msg_id,
					payload.kind,
					payload.content,
					payload.media_key,
					payload.media_mime,
					payload.media_bytes,
				)
				if members:
					values = [(room_id, member.user_id) for member in members]
					await conn.executemany(
						"""
						INSERT INTO room_receipts (room_id, user_id, delivered_seq, read_seq)
						VALUES ($1,$2,0,0)
						ON CONFLICT (room_id, user_id) DO NOTHING
						""",
						values,
					)
			return _row_to_message(row)

	async def fetch_messages(
		self,
		*,
		room_id: str,
		direction: str,
		anchor: Optional[int],
		limit: int,
	) -> List[models.RoomMessage]:
		pool = await self._get_pool()
		if pool is None:
			return await self._fetch_messages_memory(room_id, direction=direction, anchor=anchor, limit=limit)
		async with pool.acquire() as conn:
			if direction == "forward":
				if anchor is None:
					rows = await conn.fetch(
						"SELECT * FROM room_messages WHERE room_id=$1 ORDER BY seq ASC LIMIT $2",
						room_id,
						limit,
					)
				else:
					rows = await conn.fetch(
						"SELECT * FROM room_messages WHERE room_id=$1 AND seq>$2 ORDER BY seq ASC LIMIT $3",
						room_id,
						anchor,
						limit,
					)
			else:
				if anchor is None:
					rows = await conn.fetch(
						"SELECT * FROM room_messages WHERE room_id=$1 ORDER BY seq DESC LIMIT $2",
						room_id,
						limit,
					)
				else:
					rows = await conn.fetch(
						"SELECT * FROM room_messages WHERE room_id=$1 AND seq<$2 ORDER BY seq DESC LIMIT $3",
						room_id,
						anchor,
						limit,
					)
				rows = list(reversed(rows))
		return [_row_to_message(row) for row in rows]

	async def _fetch_messages_memory(
		self,
		room_id: str,
		*,
		direction: str,
		anchor: Optional[int],
		limit: int,
	) -> List[models.RoomMessage]:
		messages = await _STORE.list_messages(room_id)
		if direction == "forward":
			filtered = [m for m in messages if anchor is None or m.seq > anchor]
			filtered = sorted(filtered, key=lambda m: m.seq)
			return filtered[:limit]
		filtered = [m for m in messages if anchor is None or m.seq < anchor]
		filtered = sorted(filtered, key=lambda m: m.seq, reverse=True)
		selected = list(reversed(filtered[:limit]))
		return selected

	async def update_delivered(self, room_id: str, user_id: str, seq: int) -> int:
		pool = await self._get_pool()
		if pool is None:
			return await _STORE.update_delivered(room_id, user_id, seq)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				INSERT INTO room_receipts (room_id, user_id, delivered_seq, read_seq)
				VALUES ($1,$2,$3,0)
				ON CONFLICT (room_id, user_id)
				DO UPDATE SET delivered_seq = GREATEST(room_receipts.delivered_seq, EXCLUDED.delivered_seq)
				RETURNING delivered_seq
				""",
				room_id,
				user_id,
				seq,
			)
			return int(row["delivered_seq"]) if row else seq

	async def update_read(self, room_id: str, user_id: str, seq: int) -> int:
		pool = await self._get_pool()
		if pool is None:
			return await _STORE.update_read(room_id, user_id, seq)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				INSERT INTO room_receipts (room_id, user_id, delivered_seq, read_seq)
				VALUES ($1,$2,$3,$3)
				ON CONFLICT (room_id, user_id)
				DO UPDATE SET
					read_seq = GREATEST(room_receipts.read_seq, EXCLUDED.read_seq),
					delivered_seq = GREATEST(room_receipts.delivered_seq, EXCLUDED.delivered_seq)
				RETURNING read_seq
				""",
				room_id,
				user_id,
				seq,
			)
			return int(row["read_seq"]) if row else seq


class RoomChatService:
	def __init__(self, *, room_service: service.RoomService | None = None) -> None:
		self._room_service = room_service or service.RoomService()
		self._repo = RoomChatRepository()

	async def send_message(
		self,
		auth_user: AuthenticatedUser,
		room_id: str,
		payload: schemas.RoomMessageSendRequest,
	) -> schemas.RoomMessageDTO:
		room = await self._room_service._require_room(room_id)
		member = await self._room_service._require_member(room_id, auth_user.id)
		policy.ensure_not_muted(member)
		await policy.enforce_send_limit(auth_user.id)
		attachments.validate_message_payload(payload)
		members = await self._room_service._repo.list_members(room_id)
		message = await self._repo.persist_message(
			room_id=room.id,
			sender_id=auth_user.id,
			payload=payload,
			members=members,
		)
		await sockets.emit_message("room_msg_new", room_id, message.to_dict())
		delivered = await self._repo.update_delivered(room_id, auth_user.id, message.seq)
		await sockets.emit_user_event(
			auth_user.id,
			"room:msg:delivered",
			{"room_id": room_id, "user_id": auth_user.id, "up_to_seq": delivered},
		)
		await outbox.append_room_chat_event(
			"msg_new",
			room_id=room_id,
			msg_id=message.id,
			seq=message.seq,
			user_id=auth_user.id,
		)
		return schemas.RoomMessageDTO(**message.to_dict())

	async def history(
		self,
		auth_user: AuthenticatedUser,
		room_id: str,
		*,
		cursor: Optional[str],
		direction: str,
		limit: int,
	) -> schemas.RoomHistoryResponse:
		await self._room_service._require_member(room_id, auth_user.id)
		cursor_room, anchor = _decode_cursor(cursor)
		if cursor_room and cursor_room != room_id:
			anchor = None
		limit = max(1, min(limit, 200))
		messages = await self._repo.fetch_messages(
			room_id=room_id,
			direction=direction,
			anchor=anchor,
			limit=limit,
		)
		if direction == "forward":
			next_cursor = _encode_cursor(room_id, messages[-1].seq) if messages else None
		else:
			next_cursor = _encode_cursor(room_id, messages[0].seq) if messages else None
		items = [schemas.RoomMessageDTO(**message.to_dict()) for message in messages]
		return schemas.RoomHistoryResponse(items=items, cursor=next_cursor, direction=direction)

	async def mark_read(
		self,
		auth_user: AuthenticatedUser,
		room_id: str,
		payload: schemas.ReadRequest,
	) -> None:
		await self._room_service._require_member(room_id, auth_user.id)
		up_to = await self._repo.update_read(room_id, auth_user.id, payload.up_to_seq)
		await sockets.emit_message(
			"room_msg_read",
			room_id,
			{"room_id": room_id, "user_id": auth_user.id, "up_to_seq": up_to},
		)
		await outbox.append_room_chat_event(
			"msg_read",
			room_id=room_id,
			msg_id="",
			seq=up_to,
			user_id=auth_user.id,
		)


async def reset_message_store() -> None:
	"""Test helper to clear in-memory message store."""
	async with _STORE._lock:  # type: ignore[attr-defined]
		_STORE.messages.clear()
		_STORE.client_index.clear()
		_STORE.receipts.clear()

