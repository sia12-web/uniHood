"""Domain models for chat transport."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Tuple


@dataclass(slots=True)
class ConversationKey:
	"""Canonical representation of a 1:1 chat conversation."""

	user_a: str
	user_b: str

	@classmethod
	def from_participants(cls, user_one: str, user_two: str) -> "ConversationKey":
		ordered = tuple(sorted((str(user_one), str(user_two))))
		return cls(user_a=ordered[0], user_b=ordered[1])

	@property
	def conversation_id(self) -> str:
		return f"chat:{self.user_a}:{self.user_b}"

	def participants(self) -> Tuple[str, str]:
		return (self.user_a, self.user_b)


@dataclass(slots=True)
class AttachmentMeta:
	attachment_id: str
	media_type: str
	size_bytes: int | None = None
	file_name: str | None = None
	remote_url: str | None = None


@dataclass(slots=True)
class ChatMessage:
	message_id: str
	client_msg_id: str
	conversation_id: str
	seq: int
	sender_id: str
	recipient_id: str
	body: str
	attachments: Tuple[AttachmentMeta, ...]
	created_at: datetime

	def to_dict(self) -> dict:
		return {
			"message_id": self.message_id,
			"client_msg_id": self.client_msg_id,
			"conversation_id": self.conversation_id,
			"seq": self.seq,
			"sender_id": self.sender_id,
			"recipient_id": self.recipient_id,
			"body": self.body,
			"attachments": [vars(attachment) for attachment in self.attachments],
			"created_at": self.created_at.isoformat(),
		}

	def is_participant(self, user_id: str) -> bool:
		return user_id in (self.sender_id, self.recipient_id)


@dataclass(slots=True)
class DeliveryState:
	conversation_id: str
	user_id: str
	delivered_seq: int


@dataclass(slots=True)
class ConversationCursor:
	conversation_id: str
	seq: int

	def encode(self) -> str:
		return f"{self.conversation_id}:{self.seq}"

	@classmethod
	def decode(cls, value: str) -> "ConversationCursor":
		conversation_id, seq_str = value.split(":", 1)
		return cls(conversation_id=conversation_id, seq=int(seq_str))


def attach_iterable(raw: Iterable[AttachmentMeta]) -> Tuple[AttachmentMeta, ...]:
	return tuple(raw)
