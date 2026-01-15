"""FastAPI routes for rooms & group chat."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.domain.rooms import RoomChatService, RoomService, policy, schemas
from app.domain.rooms import attachments
from app.domain.rooms.attachments import AttachmentValidationError
from app.infra.auth import AuthenticatedUser, get_current_user
from app.domain.chat.service import ensure_dm_conversation
from app.api.request_id import get_request_id
from app.api.security_deps import require_same_campus
from app.infra import idempotency
from app.infra.idempotency import IdempotencyConflictError, IdempotencyUnavailableError
from app.infra.postgres import get_pool
from app.obs import audit as obs_audit

router = APIRouter(prefix="/rooms", tags=["rooms"])

_room_service = RoomService()
_chat_service = RoomChatService(room_service=_room_service)


def _as_http_error(exc: Exception) -> HTTPException:
	if isinstance(exc, policy.RoomPolicyError):
		return HTTPException(status_code=exc.status_code, detail=exc.detail)
	if isinstance(exc, AttachmentValidationError):
		return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
	return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/create", response_model=schemas.RoomSummary)
async def create_room_endpoint(
	request: Request,
	payload: schemas.RoomCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		require_same_campus(payload.campus_id or auth_user.campus_id, auth_user)
		result = await _room_service.create_room(auth_user, payload)
	except Exception as exc:  # pragma: no cover - converted immediately
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.create",
		extra={"room_id": result.id, "campus_id": result.campus_id},
	)
	return result


@router.post("/dm", response_model=schemas.DMRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_dm_room_endpoint(
	request: Request,
	payload: schemas.DMRoomCreateRequest,
	response: Response,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.DMRoomResponse:
	request_id = get_request_id(request)
	peer_id = str(payload.peer_id)
	if str(auth_user.id) == peer_id:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_peer", headers={"X-Request-Id": request_id})
	try:
		require_same_campus(payload.campus_id, auth_user)
	except HTTPException as exc:
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail=exc.detail, headers={"X-Request-Id": request_id}) from exc
	pool = await get_pool()
	async with pool.acquire() as conn:
		peer_row = await conn.fetchrow("SELECT campus_id FROM users WHERE id = $1", peer_id)
	if not peer_row:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="peer_not_found", headers={"X-Request-Id": request_id})
	peer_campus = str(peer_row["campus_id"])
	try:
		require_same_campus(peer_campus, auth_user)
	except HTTPException as exc:
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail=exc.detail, headers={"X-Request-Id": request_id}) from exc
	a, b = sorted((str(auth_user.id), peer_id))
	key = getattr(request.state, "idem_key", None) or f"{a}:{b}"
	try:
		payload_hash = idempotency.hash_payload(f"{a}:{b}")
		idem = await idempotency.begin(key, "rooms.dm", payload_hash=payload_hash)
	except IdempotencyUnavailableError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
	except IdempotencyConflictError:
		raise HTTPException(status.HTTP_409_CONFLICT, detail="idempotency_conflict", headers={"X-Request-Id": request_id}) from None
	room_id = f"dm:{a}:{b}"
	idempotent_hit = False
	if idem:
		idempotent_hit = True
		response.status_code = status.HTTP_200_OK
		result = schemas.DMRoomResponse(room_id=room_id, conversation_id=idem["result_id"], participants=[a, b])
	else:
		try:
			conversation = await ensure_dm_conversation(auth_user, peer_id)
		except ValueError as exc:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc), headers={"X-Request-Id": request_id}) from exc
		try:
			await idempotency.complete(key, "rooms.dm", conversation.conversation_id)
		except IdempotencyUnavailableError:
			raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
		response.status_code = status.HTTP_201_CREATED
		result = schemas.DMRoomResponse(room_id=room_id, conversation_id=conversation.conversation_id, participants=[a, b])
	response.headers["X-Request-Id"] = request_id
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.dm_create",
		extra={
			"room_id": result.room_id,
			"conversation_id": result.conversation_id,
			"peer_id": peer_id,
			"idempotent": idempotent_hit,
		},
	)
	return result


@router.post("/{room_id}/invite-code/rotate", response_model=schemas.RotateInviteResponse)
async def rotate_code_endpoint(
	request: Request,
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RotateInviteResponse:
	try:
		result = await _room_service.rotate_join_code(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.rotate_invite",
		extra={"room_id": room_id},
	)
	return result


@router.post("/join/by-code", response_model=schemas.RoomSummary)
async def join_by_code_endpoint(
	request: Request,
	payload: schemas.JoinByCodeRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		result = await _room_service.join_by_code(auth_user, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.join_by_code",
		extra={"room_id": result.id},
	)
	return result


@router.post("/{room_id}/join", response_model=schemas.RoomSummary)
async def join_room_endpoint(
	request: Request,
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		result = await _room_service.join_room(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.join",
		extra={"room_id": room_id},
	)
	return result


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
async def leave_room_endpoint(
	request: Request,
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await _room_service.leave_room(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.leave",
		extra={"room_id": room_id},
	)
	return {"ok": True}

@router.get("/my", response_model=list[schemas.RoomSummary])
async def list_my_rooms_endpoint(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[schemas.RoomSummary]:
	try:
		return await _room_service.list_my_rooms(auth_user)
	except Exception as exc:
		raise _as_http_error(exc) from exc



@router.get("/{room_id}", response_model=schemas.RoomDetail)
async def get_room_endpoint(
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomDetail:
	try:
		return await _room_service.get_room(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc

@router.post("/{room_id}/send", response_model=schemas.RoomMessageDTO)
async def send_room_message_endpoint(
	request: Request,
	room_id: str,
	payload: schemas.RoomMessageSendRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomMessageDTO:
	try:
		message = await _chat_service.send_message(auth_user, room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.send",
		extra={"room_id": room_id, "message_id": message.id, "kind": payload.kind},
	)
	return message


@router.get("/{room_id}/history", response_model=schemas.RoomHistoryResponse)
async def history_endpoint(
	room_id: str,
	cursor: str | None = Query(default=None),
	direction: str = Query(default="backward", pattern="^(backward|forward)$"),
	limit: int = Query(default=50, ge=1, le=200),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomHistoryResponse:
	try:
		return await _chat_service.history(auth_user, room_id, cursor=cursor, direction=direction, limit=limit)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{room_id}/read", status_code=status.HTTP_200_OK)
async def read_endpoint(
	request: Request,
	room_id: str,
	payload: schemas.ReadRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await _chat_service.mark_read(auth_user, room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.read",
		extra={"room_id": room_id, "up_to_seq": payload.up_to_seq},
	)
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/role", status_code=status.HTTP_200_OK)
async def role_update_endpoint(
	request: Request,
	room_id: str,
	user_id: str,
	payload: schemas.RoleUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await _room_service.update_role(auth_user, room_id, user_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.role_update",
		extra={"room_id": room_id, "target_user_id": user_id, "role": payload.role},
	)
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/mute", status_code=status.HTTP_200_OK)
async def mute_endpoint(
	request: Request,
	room_id: str,
	user_id: str,
	payload: schemas.MuteRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await _room_service.mute_member(auth_user, room_id, user_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.mute",
		extra={"room_id": room_id, "target_user_id": user_id, "on": payload.on},
	)
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/kick", status_code=status.HTTP_200_OK)
async def kick_endpoint(
	request: Request,
	room_id: str,
	user_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await _room_service.kick_member(auth_user, room_id, user_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.kick",
		extra={"room_id": room_id, "target_user_id": user_id},
	)
	return {"ok": True}


@router.post("/attachments/presign", response_model=schemas.PresignResponse)
async def presign_endpoint(
	request: Request,
	payload: schemas.PresignRequest,
	room_id: str = Query(..., description="Room context for upload"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PresignResponse:
	try:
		await _room_service._require_member(room_id, auth_user.id)
		result = attachments.presign_upload(room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		auth_user,
		"rooms.presign",
		extra={"room_id": room_id, "kind": payload.kind},
	)
	return result

