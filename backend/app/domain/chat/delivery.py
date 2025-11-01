"""Delivery tracking helpers."""

from __future__ import annotations

from typing import Protocol


class DeliveryRepository(Protocol):
	async def get_delivered_seq(self, conversation_id: str, user_id: str) -> int:
		...

	async def update_delivered_seq(self, conversation_id: str, user_id: str, seq: int) -> None:
		...


async def read_delivered_seq(repo: DeliveryRepository, conversation_id: str, user_id: str) -> int:
	return await repo.get_delivered_seq(conversation_id, user_id)


async def mark_delivered(repo: DeliveryRepository, conversation_id: str, user_id: str, seq: int) -> int:
	await repo.update_delivered_seq(conversation_id, user_id, seq)
	return seq
