"""FastAPI endpoints for chat transport."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.domain.chat.models import ConversationKey
from app.domain.chat.schemas import (
	DeliveryAckRequest,
	DeliveryAckResponse,
	MessageListResponse,
	MessageResponse,
	OutboxResponse,
	SendMessageRequest,
)
from app.domain.chat.service import acknowledge_delivery, get_message, list_messages, load_outbox, send_message
from app.infra.auth import AuthenticatedUser, get_current_user
from app.api.pagination import decode_cursor
from app.api.request_id import get_request_id
from app.infra import idempotency
from app.infra.idempotency import IdempotencyConflictError, IdempotencyUnavailableError

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_endpoint(
	payload: SendMessageRequest,
	request: Request,
	response: Response,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> MessageResponse:
	request_id = get_request_id(request)
	key = getattr(request.state, "idem_key", None) or str(uuid.uuid4())
	try:
		payload_body = payload.model_dump(mode="json")  # type: ignore[attr-defined]
	except AttributeError:
		payload_body = payload.dict()
	serialized = json.dumps(payload_body, sort_keys=True)
	try:
		payload_hash = idempotency.hash_payload(serialized)
		existing = await idempotency.begin(key, "messages.send", payload_hash=payload_hash)
	except IdempotencyUnavailableError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
	except IdempotencyConflictError:
		raise HTTPException(status.HTTP_409_CONFLICT, detail="idempotency_conflict", headers={"X-Request-Id": request_id}) from None
	if existing:
		try:
			message = await get_message(auth_user, existing["result_id"])
		except ValueError:
			raise HTTPException(status.HTTP_409_CONFLICT, detail="idempotency_conflict", headers={"X-Request-Id": request_id}) from None
		response.status_code = status.HTTP_200_OK
		response.headers["X-Request-Id"] = request_id
		return message
	try:
		result = await send_message(auth_user, payload)
	except ValueError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc), headers={"X-Request-Id": request_id}) from exc
	try:
		await idempotency.complete(key, "messages.send", result.message_id)
	except IdempotencyUnavailableError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
	response.status_code = status.HTTP_201_CREATED
	response.headers["X-Request-Id"] = request_id
	return result


@router.get("/conversations/{user_id}/messages", response_model=MessageListResponse)
async def list_messages_endpoint(
	user_id: str,
	*,
	cursor: str | None = Query(default=None),
	limit: int = Query(default=50, ge=1, le=200),
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> MessageListResponse:
	bounded_limit = min(limit, 100)
	decoded_cursor = None
	if cursor:
		try:
			decoded_cursor = decode_cursor(cursor)
		except Exception:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_cursor", headers={"X-Request-Id": get_request_id(request)}) from None
	return await list_messages(auth_user, user_id, cursor=decoded_cursor, limit=bounded_limit)


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
