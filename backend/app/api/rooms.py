"""FastAPI routes for rooms & group chat."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.rooms import RoomChatService, RoomService, policy, schemas
from app.domain.rooms import attachments
from app.domain.rooms.attachments import AttachmentValidationError
from app.infra.auth import AuthenticatedUser, get_current_user

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
	payload: schemas.RoomCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		return await _room_service.create_room(auth_user, payload)
	except Exception as exc:  # pragma: no cover - converted immediately
		raise _as_http_error(exc) from exc


@router.post("/{room_id}/invite-code/rotate", response_model=schemas.RotateInviteResponse)
async def rotate_code_endpoint(
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RotateInviteResponse:
	try:
		return await _room_service.rotate_join_code(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/join/by-code", response_model=schemas.RoomSummary)
async def join_by_code_endpoint(
	payload: schemas.JoinByCodeRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		return await _room_service.join_by_code(auth_user, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{room_id}/join", response_model=schemas.RoomSummary)
async def join_room_endpoint(
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomSummary:
	try:
		return await _room_service.join_room(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
async def leave_room_endpoint(
	room_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await _room_service.leave_room(auth_user, room_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
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
	room_id: str,
	payload: schemas.RoomMessageSendRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RoomMessageDTO:
	try:
		return await _chat_service.send_message(auth_user, room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc


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
	room_id: str,
	payload: schemas.ReadRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await _chat_service.mark_read(auth_user, room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/role", status_code=status.HTTP_200_OK)
async def role_update_endpoint(
	room_id: str,
	user_id: str,
	payload: schemas.RoleUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await _room_service.update_role(auth_user, room_id, user_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/mute", status_code=status.HTTP_200_OK)
async def mute_endpoint(
	room_id: str,
	user_id: str,
	payload: schemas.MuteRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await _room_service.mute_member(auth_user, room_id, user_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	return {"ok": True}


@router.post("/{room_id}/members/{user_id}/kick", status_code=status.HTTP_200_OK)
async def kick_endpoint(
	room_id: str,
	user_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await _room_service.kick_member(auth_user, room_id, user_id)
	except Exception as exc:
		raise _as_http_error(exc) from exc
	return {"ok": True}


@router.post("/attachments/presign", response_model=schemas.PresignResponse)
async def presign_endpoint(
	payload: schemas.PresignRequest,
	room_id: str = Query(..., description="Room context for upload"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PresignResponse:
	try:
		await _room_service._require_member(room_id, auth_user.id)
		return attachments.presign_upload(room_id, payload)
	except Exception as exc:
		raise _as_http_error(exc) from exc

