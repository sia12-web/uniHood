"""Pydantic schemas for chat transport API."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .models import AttachmentMeta, ChatMessage


class MessageAttachment(BaseModel):
	attachment_id: str = Field(..., examples=["01HZY5AJ6HT7PM1F8M3X2W8Z9V"])
	media_type: str
	size_bytes: Optional[int] = None
	file_name: Optional[str] = None
	remote_url: Optional[str] = None

	@classmethod
	def from_meta(cls, meta: AttachmentMeta) -> "MessageAttachment":
		return cls(**meta.__dict__)


class SendMessageRequest(BaseModel):
	to_user_id: str = Field(..., description="Target user identifier")
	body: str = Field(..., min_length=1, max_length=4000)
	client_msg_id: Optional[str] = Field(default=None, description="Client-generated ULID")
	attachments: Optional[List[MessageAttachment]] = None


class MessageResponse(BaseModel):
	message_id: str
	client_msg_id: str
	seq: int
	conversation_id: str
	sender_id: str
	recipient_id: str
	body: str
	attachments: List[MessageAttachment]
	created_at: datetime
	moderation: dict[str, bool] | None = None

	@classmethod
	def from_model(
		cls,
		message: ChatMessage,
		*,
		moderation: dict[str, bool] | None = None,
	) -> "MessageResponse":
		return cls(
			message_id=str(message.message_id),
			client_msg_id=str(message.client_msg_id),
			seq=int(message.seq),
			conversation_id=str(message.conversation_id),
			sender_id=str(message.sender_id),
			recipient_id=str(message.recipient_id),
			body=message.body,
			attachments=[MessageAttachment.from_meta(meta) for meta in message.attachments],
			created_at=message.created_at,
			moderation=moderation,
		)


class MessageListResponse(BaseModel):
	items: List[MessageResponse]
	next_cursor: Optional[str] = None


class DeliveryAckRequest(BaseModel):
	delivered_seq: int = Field(..., ge=0)


class DeliveryAckResponse(BaseModel):
	conversation_id: str
	delivered_seq: int


class OutboxResponse(BaseModel):
	items: List[MessageResponse]
	reset_cursor: Optional[str] = None
