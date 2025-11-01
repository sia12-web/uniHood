"""REST API surface for invites & friendships (Phase 2)."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.social import audit, service
from app.domain.social.exceptions import (
	BlockLimitExceeded,
	InviteAlreadyFriends,
	InviteAlreadySent,
	InviteBlocked,
	InviteConflict,
	InviteForbidden,
	InviteGone,
	InviteNotFound,
	InviteRateLimitExceeded,
	InviteSelfError,
)
from app.domain.social.schemas import FriendRow, InviteSendRequest, InviteSummary
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter()


def _map_error(exc: Exception) -> HTTPException:
	if isinstance(exc, InviteRateLimitExceeded) or isinstance(exc, BlockLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=getattr(exc, "reason", "rate_limit"))
	if isinstance(exc, InviteAlreadySent) or isinstance(exc, InviteAlreadyFriends) or isinstance(exc, InviteConflict) or isinstance(exc, InviteSelfError):
		return HTTPException(status.HTTP_409_CONFLICT, detail=getattr(exc, "reason", "conflict"))
	if isinstance(exc, InviteBlocked) or isinstance(exc, InviteForbidden):
		return HTTPException(status.HTTP_403_FORBIDDEN, detail=getattr(exc, "reason", "forbidden"))
	if isinstance(exc, InviteGone):
		return HTTPException(status.HTTP_410_GONE, detail=getattr(exc, "reason", "gone"))
	if isinstance(exc, InviteNotFound):
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=getattr(exc, "reason", "not_found"))
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/invites/send", response_model=InviteSummary)
async def send_invite(
	payload: InviteSendRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	try:
		summary = await service.send_invite(auth_user, payload.to_user_id, payload.campus_id)
	except (InviteAlreadySent, InviteAlreadyFriends, InviteSelfError) as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc) from None
	except InviteBlocked as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc) from None
	except InviteRateLimitExceeded as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc) from None
	except InviteConflict as exc:
		raise _map_error(exc) from None
	return summary


@router.post("/invites/{invite_id}/accept", response_model=InviteSummary)
async def accept_invite(
	invite_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	try:
		return await service.accept_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc) from None


@router.post("/invites/{invite_id}/decline", response_model=InviteSummary)
async def decline_invite(
	invite_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	try:
		return await service.decline_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc) from None


@router.post("/invites/{invite_id}/cancel", response_model=InviteSummary)
async def cancel_invite(
	invite_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	try:
		return await service.cancel_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc) from None


@router.get("/invites/inbox", response_model=List[InviteSummary])
async def inbox(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[InviteSummary]:
	return await service.list_inbox(auth_user)


@router.get("/invites/outbox", response_model=List[InviteSummary])
async def outbox(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[InviteSummary]:
	return await service.list_outbox(auth_user)


@router.get("/friends/list", response_model=List[FriendRow])
async def friends_list(
	filter: Optional[str] = Query(default="accepted"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[FriendRow]:
	status_filter = filter or "accepted"
	return await service.list_friends(auth_user, status_filter)


@router.post("/friends/{user_id}/block", response_model=FriendRow)
async def block_user(
	user_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> FriendRow:
	try:
		return await service.block_user(auth_user, user_id)
	except (InviteForbidden, BlockLimitExceeded) as exc:
		raise _map_error(exc) from None


@router.post("/friends/{user_id}/unblock")
async def unblock_user(
	user_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await service.unblock_user(auth_user, user_id)
	except Exception as exc:
		raise _map_error(exc) from None
	return {"status": "ok"}

