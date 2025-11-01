"""Outbox helpers for pending chat messages."""

from __future__ import annotations

from typing import Protocol

from .models import ChatMessage


class OutboxRepository(Protocol):
	async def fetch_outbox(self, conversation_id: str, user_id: str, after_seq: int, limit: int) -> list[ChatMessage]:
		...


async def load_pending(repo: OutboxRepository, conversation_id: str, user_id: str, after_seq: int, limit: int) -> list[ChatMessage]:
	return await repo.fetch_outbox(conversation_id, user_id, after_seq, limit)
