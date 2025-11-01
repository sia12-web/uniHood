"""FastAPI endpoints for chat transport."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.chat.models import ConversationKey
from app.domain.chat.schemas import (
	DeliveryAckRequest,
	DeliveryAckResponse,
	MessageListResponse,
	MessageResponse,
	OutboxResponse,
	SendMessageRequest,
)
from app.domain.chat.service import acknowledge_delivery, list_messages, load_outbox, send_message
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_endpoint(
	payload: SendMessageRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> MessageResponse:
	try:
		return await send_message(auth_user, payload)
	except ValueError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/conversations/{user_id}/messages", response_model=MessageListResponse)
async def list_messages_endpoint(
	user_id: str,
	*,
	cursor: str | None = Query(default=None),
	limit: int = Query(default=50, ge=1, le=200),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> MessageListResponse:
	return await list_messages(auth_user, user_id, cursor=cursor, limit=limit)


@router.post("/conversations/{user_id}/deliveries", response_model=DeliveryAckResponse)
async def acknowledge_delivery_endpoint(
	user_id: str,
	payload: DeliveryAckRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DeliveryAckResponse:
	seq = await acknowledge_delivery(auth_user, user_id, delivered_seq=payload.delivered_seq)
	conversation = ConversationKey.from_participants(auth_user.id, user_id)
	return DeliveryAckResponse(conversation_id=conversation.conversation_id, delivered_seq=seq)


@router.get("/conversations/{user_id}/outbox", response_model=OutboxResponse)
async def load_outbox_endpoint(
	user_id: str,
	limit: int = Query(default=50, ge=1, le=200),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> OutboxResponse:
	return await load_outbox(auth_user, user_id, limit=limit)
