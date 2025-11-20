"""Chat service logic for Phase 3 transport."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from datetime import datetime, timezone
from dataclasses import asdict
from typing import Iterable, List, Optional, Tuple, TYPE_CHECKING

import ulid

from . import attachments, delivery, outbox, sockets
from .models import (
	AttachmentMeta,
	ChatMessage,
	ConversationCursor,
	ConversationKey,
	attach_iterable,
)
from .schemas import MessageListResponse, MessageResponse, OutboxResponse, SendMessageRequest
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics
from app.api.pagination import encode_cursor

if TYPE_CHECKING:  # pragma: no cover - typing only
	from app.moderation.middleware.write_gate_v2 import WriteContext


_EXTERNAL_LINK_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _strip_external_links(text: str) -> str:
	return _EXTERNAL_LINK_RE.sub("[link removed]", text)


def _build_moderation_meta(ctx: "WriteContext") -> dict[str, bool] | None:
	flags: dict[str, bool] = {}
	if ctx.shadow:
		flags["shadowed"] = True
	if ctx.strip_links:
		flags["links_stripped"] = True
	if ctx.metadata.get("link_cooloff"):
		flags["link_cooloff"] = True
	return flags or None


class _InMemoryStore:
	"""Fallback store used in tests when Postgres is unavailable."""

	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self._messages: dict[str, List[ChatMessage]] = {}
		self._delivered: dict[tuple[str, str], int] = {}

	async def create_message(
		self,
		conversation: ConversationKey,
		sender_id: str,
		recipient_id: str,
		body: str,
		attachments_meta: Iterable[AttachmentMeta],
		client_msg_id: str,
		created_at: datetime,
	) -> ChatMessage:
		async with self._lock:
			conversation_id = conversation.conversation_id
			messages = self._messages.setdefault(conversation_id, [])
			seq = messages[-1].seq + 1 if messages else 1
			message = ChatMessage(
				message_id=str(ulid.new()),
				client_msg_id=client_msg_id,
				conversation_id=conversation_id,
				seq=seq,
				sender_id=sender_id,
				recipient_id=recipient_id,
				body=body,
				attachments=attach_iterable(attachments_meta),
				created_at=created_at,
			)
			messages.append(message)
			return message

	async def list_messages(
		self,
		conversation_id: str,
		*,
		cursor: Tuple[datetime, str] | None,
		limit: int,
	) -> List[ChatMessage]:
		async with self._lock:
			messages = list(self._messages.get(conversation_id, []))
			messages.sort(key=lambda m: (m.created_at, m.message_id), reverse=True)
			if cursor:
				cursor_dt, cursor_id = cursor
				filtered = [
					m
					for m in messages
					if m.created_at < cursor_dt
					or (m.created_at == cursor_dt and m.message_id < cursor_id)
				]
			else:
				filtered = messages
			return filtered[:limit]

	async def get_message(self, message_id: str) -> Optional[ChatMessage]:
		async with self._lock:
			for conversation_messages in self._messages.values():
				for message in conversation_messages:
					if message.message_id == message_id:
						return message
			return None

	async def ensure_conversation(self, conversation: ConversationKey) -> None:
		async with self._lock:
			self._messages.setdefault(conversation.conversation_id, [])

	async def fetch_outbox(self, conversation_id: str, user_id: str, after_seq: int, limit: int) -> List[ChatMessage]:
		async with self._lock:
			messages = self._messages.get(conversation_id, [])
			pending = [m for m in messages if m.seq > after_seq and m.recipient_id == user_id]
			return pending[:limit]

	async def get_delivered_seq(self, conversation_id: str, user_id: str) -> int:
		async with self._lock:
			return self._delivered.get((conversation_id, user_id), 0)

	async def update_delivered_seq(self, conversation_id: str, user_id: str, seq: int) -> None:
		async with self._lock:
			key = (conversation_id, user_id)
			existing = self._delivered.get(key, 0)
			self._delivered[key] = max(existing, seq)


_MEMORY_STORE = _InMemoryStore()


class ChatRepository:
	"""Repository backed by asyncpg with an in-memory fallback."""

	def __init__(self) -> None:
		self._pool_checked = False
		self._pool = None

	async def _pool_or_none(self):
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

	async def create_message(
		self,
		conversation: ConversationKey,
		sender_id: str,
		recipient_id: str,
		body: str,
		attachments_meta: Iterable[AttachmentMeta],
		client_msg_id: str,
		created_at: datetime,
	) -> ChatMessage:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY_STORE.create_message(
				conversation,
				sender_id,
				recipient_id,
				body,
				attachments_meta,
				client_msg_id,
				created_at,
			)
		async with pool.acquire() as conn:
			async with conn.transaction():
				conversation_id = conversation.conversation_id
				user_a, user_b = conversation.participants()
				await conn.execute(
					"""
					INSERT INTO chat_conversations (conversation_id, user_a, user_b)
					VALUES ($1, $2, $3)
					ON CONFLICT (conversation_id) DO NOTHING
					""",
					conversation_id,
					user_a,
					user_b,
				)
				seq = await self._next_sequence(conn, conversation_id)
				attachments_json = [asdict(meta) for meta in attachments_meta]
				message_id = str(ulid.new())
				await conn.execute(
					"""
					INSERT INTO chat_messages (
						conversation_id,
						seq,
						message_id,
						client_msg_id,
						sender_id,
						recipient_id,
						body,
						attachments,
						created_at
					) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
					""",
					conversation_id,
					seq,
					message_id,
					client_msg_id,
					sender_id,
					recipient_id,
					body,
					json.dumps(attachments_json),
					created_at,
				)
				return ChatMessage(
					message_id=message_id,
					client_msg_id=client_msg_id,
					conversation_id=conversation_id,
					seq=seq,
					sender_id=sender_id,
					recipient_id=recipient_id,
					body=body,
					attachments=attach_iterable(attachments_meta),
					created_at=created_at,
				)

	async def list_messages(
		self,
		conversation_id: str,
		*,
		cursor: Tuple[datetime, str] | None,
		limit: int,
	) -> List[ChatMessage]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY_STORE.list_messages(conversation_id, cursor=cursor, limit=limit)
		async with pool.acquire() as conn:
			params: List[object] = [conversation_id]
			where_clause = ""
			if cursor:
				params.extend([cursor[0], cursor[1]])
				where_clause = f" AND (created_at, message_id) < ($2, $3)"
			params.append(limit)
			query = (
				"""
				SELECT conversation_id, seq, message_id, client_msg_id, sender_id, recipient_id, body, attachments, created_at
				FROM chat_messages
				WHERE conversation_id = $1
				"""
				+ where_clause
				+ f" ORDER BY created_at DESC, message_id DESC LIMIT ${len(params)}"
			)
			rows = await conn.fetch(query, *params)
			return [self._row_to_message(str(row["conversation_id"]), row) for row in rows]

	async def get_message_by_id(self, message_id: str) -> Optional[ChatMessage]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY_STORE.get_message(message_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				SELECT conversation_id, seq, message_id, client_msg_id, sender_id, recipient_id, body, attachments, created_at
				FROM chat_messages
				WHERE message_id = $1
				""",
				message_id,
			)
			if not row:
				return None
			return self._row_to_message(str(row["conversation_id"]), row)

	async def ensure_conversation(self, conversation: ConversationKey) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			return
		user_a, user_b = conversation.participants()
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO chat_conversations (conversation_id, user_a, user_b)
				VALUES ($1, $2, $3)
				ON CONFLICT (conversation_id) DO NOTHING
				""",
				conversation.conversation_id,
				user_a,
				user_b,
			)

	async def fetch_outbox(self, conversation_id: str, user_id: str, after_seq: int, limit: int) -> List[ChatMessage]:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY_STORE.fetch_outbox(conversation_id, user_id, after_seq, limit)
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT seq, message_id, client_msg_id, sender_id, recipient_id, body, attachments, created_at
				FROM chat_messages
				WHERE conversation_id = $1 AND seq > $2 AND recipient_id = $3
				ORDER BY seq ASC
				LIMIT $4
				""",
				conversation_id,
				after_seq,
				user_id,
				limit,
			)
			return [self._row_to_message(conversation_id, row) for row in rows]

	async def get_delivered_seq(self, conversation_id: str, user_id: str) -> int:
		pool = await self._pool_or_none()
		if pool is None:
			return await _MEMORY_STORE.get_delivered_seq(conversation_id, user_id)
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"""
				SELECT delivered_seq
				FROM chat_delivery
				WHERE conversation_id = $1 AND user_id = $2
				""",
				conversation_id,
				user_id,
			)
			return int(row["delivered_seq"]) if row else 0

	async def update_delivered_seq(self, conversation_id: str, user_id: str, seq: int) -> None:
		pool = await self._pool_or_none()
		if pool is None:
			await _MEMORY_STORE.update_delivered_seq(conversation_id, user_id, seq)
			return
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO chat_delivery (conversation_id, user_id, delivered_seq)
				VALUES ($1, $2, $3)
				ON CONFLICT (conversation_id, user_id)
				DO UPDATE SET delivered_seq = GREATEST(chat_delivery.delivered_seq, EXCLUDED.delivered_seq)
				""",
				conversation_id,
				user_id,
				seq,
			)

	async def _next_sequence(self, conn, conversation_id: str) -> int:
		row = await conn.fetchrow(
			"SELECT last_seq FROM chat_seq WHERE conversation_id = $1 FOR UPDATE",
			conversation_id,
		)
		if row:
			next_seq = int(row["last_seq"]) + 1
			await conn.execute(
				"UPDATE chat_seq SET last_seq = $2 WHERE conversation_id = $1",
				conversation_id,
				next_seq,
			)
			return next_seq
		await conn.execute(
			"INSERT INTO chat_seq (conversation_id, last_seq) VALUES ($1, 1)",
			conversation_id,
		)
		return 1

	def _row_to_message(self, conversation_id: str, row) -> ChatMessage:
		attachments_raw = row["attachments"]
		if isinstance(attachments_raw, str):
			payload = json.loads(attachments_raw) if attachments_raw else []
		else:
			payload = attachments_raw or []
		attachments_meta = [AttachmentMeta(**item) for item in payload]
		client_msg_id = row["client_msg_id"] or row["message_id"]
		return ChatMessage(
			message_id=str(row["message_id"]),
			client_msg_id=str(client_msg_id),
			conversation_id=conversation_id,
			seq=int(row["seq"]),
			sender_id=str(row["sender_id"]),
			recipient_id=str(row["recipient_id"]),
			body=row["body"],
			attachments=attach_iterable(attachments_meta),
			created_at=row["created_at"],
		)


class ChatService:
	def __init__(self, repository: ChatRepository | None = None) -> None:
		self._repo = repository or ChatRepository()

	async def send_message(self, auth_user: AuthenticatedUser, payload: SendMessageRequest) -> MessageResponse:
		if auth_user.id == payload.to_user_id:
			raise ValueError("cannot message yourself")
		conversation = ConversationKey.from_participants(auth_user.id, payload.to_user_id)
		attachments_meta = attachments.normalize_attachments(
			[item.model_dump() for item in payload.attachments] if payload.attachments else None
		)
		client_msg_id = payload.client_msg_id or str(ulid.new())
		created_at = datetime.now(timezone.utc)
		from app.moderation.domain.container import get_write_gate
		from app.moderation.middleware.write_gate_v2 import WriteContext

		gate = get_write_gate()
		ctx = await gate.enforce(
			user_id=str(auth_user.id),
			surface="message",
			ctx=WriteContext(text=payload.body),
		)
		message_body = payload.body
		if ctx.strip_links:
			message_body = _strip_external_links(message_body)
		message = await self._repo.create_message(
			conversation,
			auth_user.id,
			payload.to_user_id,
			message_body,
			attachments_meta,
			client_msg_id,
			created_at,
		)
		obs_metrics.inc_chat_send()
		moderation = _build_moderation_meta(ctx)
		response = MessageResponse.from_model(message, moderation=moderation)
		response_payload = response.model_dump(mode="json")
		if not ctx.shadow:
			await sockets.emit_message(message.recipient_id, response_payload)
		await sockets.emit_echo(message.sender_id, response_payload)
		delivered_seq = await delivery.mark_delivered(
			self._repo, message.conversation_id, message.recipient_id, message.seq
		)
		obs_metrics.inc_chat_delivered()
		await sockets.emit_delivery(
			message.sender_id,
			{
				"peer_id": message.recipient_id,
				"conversation_id": message.conversation_id,
				"delivered_seq": delivered_seq,
				"source": "send",
			},
		)
		return response

	async def get_message(self, auth_user: AuthenticatedUser, message_id: str) -> MessageResponse:
		message = await self._repo.get_message_by_id(message_id)
		if not message or not message.is_participant(str(auth_user.id)):
			raise ValueError("message_not_found")
		return MessageResponse.from_model(message)

	async def ensure_dm_conversation(self, auth_user: AuthenticatedUser, peer_id: str) -> ConversationKey:
		if str(auth_user.id) == str(peer_id):
			raise ValueError("cannot_dm_self")
		conversation = ConversationKey.from_participants(auth_user.id, peer_id)
		await self._repo.ensure_conversation(conversation)
		return conversation

	async def list_messages(
		self,
		auth_user: AuthenticatedUser,
		other_user_id: str,
		*,
		cursor: Optional[Tuple[datetime, str]],
		limit: int,
	) -> MessageListResponse:
		conversation = ConversationKey.from_participants(auth_user.id, other_user_id)
		rows = await self._repo.list_messages(
			conversation.conversation_id,
			cursor=cursor,
			limit=limit + 1,
		)
		page = rows[:limit]
		items = [MessageResponse.from_model(msg) for msg in page]
		next_cursor = None
		if len(rows) > limit and page:
			last = page[-1]
			next_cursor = encode_cursor(last.created_at, last.message_id)
		return MessageListResponse(items=items, next=next_cursor)

	async def acknowledge_delivery(
		self,
		auth_user: AuthenticatedUser,
		other_user_id: str,
		*,
		delivered_seq: int,
	) -> int:
		conversation = ConversationKey.from_participants(auth_user.id, other_user_id)
		delivered = await delivery.mark_delivered(
			self._repo, conversation.conversation_id, auth_user.id, delivered_seq
		)
		obs_metrics.inc_chat_delivered()
		await sockets.emit_delivery(
			other_user_id,
			{
				"peer_id": auth_user.id,
				"conversation_id": conversation.conversation_id,
				"delivered_seq": delivered,
				"source": "ack",
			},
		)
		return delivered

	async def load_outbox(
		self,
		auth_user: AuthenticatedUser,
		other_user_id: str,
		*,
		limit: int,
	) -> OutboxResponse:
		conversation = ConversationKey.from_participants(auth_user.id, other_user_id)
		current_seq = await delivery.read_delivered_seq(self._repo, conversation.conversation_id, auth_user.id)
		pending = await outbox.load_pending(
			self._repo,
			conversation.conversation_id,
			auth_user.id,
			after_seq=current_seq,
			limit=limit,
		)
		items = [MessageResponse.from_model(msg) for msg in pending]
		reset_cursor = None
		if items:
			last = pending[-1]
			reset_cursor = base64.b64encode(
				ConversationCursor(conversation.conversation_id, last.seq).encode().encode()
			).decode()
			delivered_seq = await delivery.mark_delivered(
				self._repo, conversation.conversation_id, auth_user.id, last.seq
			)
			await sockets.emit_delivery(
				other_user_id,
				{
					"peer_id": auth_user.id,
					"conversation_id": conversation.conversation_id,
					"delivered_seq": delivered_seq,
					"source": "ack",
				},
			)
		return OutboxResponse(items=items, reset_cursor=reset_cursor)


_SERVICE = ChatService()


async def send_message(auth_user: AuthenticatedUser, payload: SendMessageRequest) -> MessageResponse:
	return await _SERVICE.send_message(auth_user, payload)


async def list_messages(
	auth_user: AuthenticatedUser,
	other_user_id: str,
	*,
	cursor: Optional[Tuple[datetime, str]],
	limit: int,
) -> MessageListResponse:
	return await _SERVICE.list_messages(auth_user, other_user_id, cursor=cursor, limit=limit)


async def get_message(auth_user: AuthenticatedUser, message_id: str) -> MessageResponse:
	return await _SERVICE.get_message(auth_user, message_id)


async def ensure_dm_conversation(auth_user: AuthenticatedUser, peer_id: str) -> ConversationKey:
	return await _SERVICE.ensure_dm_conversation(auth_user, peer_id)


async def acknowledge_delivery(auth_user: AuthenticatedUser, other_user_id: str, delivered_seq: int) -> int:
	return await _SERVICE.acknowledge_delivery(auth_user, other_user_id, delivered_seq=delivered_seq)


async def load_outbox(auth_user: AuthenticatedUser, other_user_id: str, *, limit: int) -> OutboxResponse:
	return await _SERVICE.load_outbox(auth_user, other_user_id, limit=limit)
