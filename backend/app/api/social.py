"""REST API surface for invites & friendships (Phase 2 & pagination extension)."""

from __future__ import annotations

import json
from typing import List, Optional
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.domain.social import audit, service, notifications, policy
from app.domain.social.models import LEVEL_INVITE_LIMITS

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
from app.domain.social.schemas import FriendRow, InviteSendRequest, InviteSummary, MutualFriend
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra import idempotency
from app.infra.idempotency import IdempotencyConflictError, IdempotencyUnavailableError
from app.api.request_id import get_request_id
from app.api.pagination import encode_cursor, decode_cursor
from pydantic import BaseModel


class InviteListPage(BaseModel):
	items: List[InviteSummary]
	next: Optional[str] = None

class SocialUsageResponse(BaseModel):
	daily_limit: int
	daily_usage: int

router = APIRouter()


def _map_error(exc: Exception, request_id: str) -> HTTPException:
	headers = {"X-Request-Id": request_id}
	if isinstance(exc, InviteRateLimitExceeded) or isinstance(exc, BlockLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=getattr(exc, "reason", "rate_limit"), headers=headers)
	if isinstance(exc, InviteAlreadySent) or isinstance(exc, InviteAlreadyFriends) or isinstance(exc, InviteConflict) or isinstance(exc, InviteSelfError):
		return HTTPException(status.HTTP_409_CONFLICT, detail=getattr(exc, "reason", "conflict"), headers=headers)
	if isinstance(exc, InviteBlocked) or isinstance(exc, InviteForbidden):
		return HTTPException(status.HTTP_403_FORBIDDEN, detail=getattr(exc, "reason", "forbidden"), headers=headers)
	if isinstance(exc, InviteGone):
		return HTTPException(status.HTTP_410_GONE, detail=getattr(exc, "reason", "gone"), headers=headers)
	if isinstance(exc, InviteNotFound):
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=getattr(exc, "reason", "not_found"), headers=headers)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc), headers=headers)


@router.post("/invites/send", response_model=InviteSummary)
async def send_invite(
	payload: InviteSendRequest,
	request: Request,
	response: Response,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	request_id = get_request_id(request)
	key = getattr(request.state, "idem_key", None) or str(uuid.uuid4())
	try:
		payload_body = payload.model_dump(mode="json")  # type: ignore[attr-defined]
	except AttributeError:
		payload_body = payload.dict()
	serialized = json.dumps(payload_body, sort_keys=True)
	try:
		payload_hash = idempotency.hash_payload(serialized)
		idempotent = await idempotency.begin(key, "invitations.create", payload_hash=payload_hash)
	except IdempotencyUnavailableError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
	except IdempotencyConflictError:
		raise HTTPException(status.HTTP_409_CONFLICT, detail="idempotency_conflict", headers={"X-Request-Id": request_id}) from None
	if idempotent:
		summary = await service.get_invite_summary(idempotent["result_id"])
		response.status_code = status.HTTP_200_OK
		response.headers["X-Request-Id"] = request_id
		return summary
	try:
		summary = await service.send_invite(auth_user, payload.to_user_id, payload.campus_id)
	except (InviteAlreadySent, InviteAlreadyFriends, InviteSelfError) as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc, request_id) from None
	except InviteBlocked as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc, request_id) from None
	except InviteRateLimitExceeded as exc:
		audit.inc_send_reject(exc.reason)
		raise _map_error(exc, request_id) from None
	except InviteConflict as exc:
		raise _map_error(exc, request_id) from None
	try:
		await idempotency.complete(key, "invitations.create", str(summary.id))
	except IdempotencyUnavailableError:
		raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="idempotency_unavailable", headers={"X-Request-Id": request_id}) from None
	response.status_code = status.HTTP_201_CREATED
	response.headers["X-Request-Id"] = request_id
	return summary


@router.post("/invites/{invite_id}/accept", response_model=InviteSummary)
async def accept_invite(
	invite_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	request_id = get_request_id(request)
	try:
		return await service.accept_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc, request_id) from None


@router.post("/invites/{invite_id}/decline", response_model=InviteSummary)
async def decline_invite(
	invite_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	request_id = get_request_id(request)
	try:
		return await service.decline_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc, request_id) from None


@router.post("/invites/{invite_id}/cancel", response_model=InviteSummary)
async def cancel_invite(
	invite_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteSummary:
	request_id = get_request_id(request)
	try:
		return await service.cancel_invite(auth_user, invite_id)
	except Exception as exc:
		raise _map_error(exc, request_id) from None


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


@router.get("/invites/inbox/page", response_model=InviteListPage)
async def inbox_page(
	request: Request,
	cursor: Optional[str] = Query(default=None),
	limit: int = Query(default=50, ge=1, le=200),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteListPage:
	request_id = get_request_id(request)
	bounded = min(limit, 100)
	decoded = None
	if cursor:
		try:
			decoded = decode_cursor(cursor)
		except Exception:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_cursor", headers={"X-Request-Id": request_id}) from None
	items, next_dt, next_id = await service.list_inbox_paginated(auth_user, cursor=decoded, limit=bounded)
	next_token = encode_cursor(next_dt, str(next_id)) if (next_dt and next_id) else None
	return InviteListPage(items=items, next=next_token)


@router.get("/invites/outbox/page", response_model=InviteListPage)
async def outbox_page(
	request: Request,
	cursor: Optional[str] = Query(default=None),
	limit: int = Query(default=50, ge=1, le=200),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InviteListPage:
	request_id = get_request_id(request)
	bounded = min(limit, 100)
	decoded = None
	if cursor:
		try:
			decoded = decode_cursor(cursor)
		except Exception:
			raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_cursor", headers={"X-Request-Id": request_id}) from None
	items, next_dt, next_id = await service.list_outbox_paginated(auth_user, cursor=decoded, limit=bounded)
	next_token = encode_cursor(next_dt, str(next_id)) if (next_dt and next_id) else None
	return InviteListPage(items=items, next=next_token)


@router.post("/friends/{user_id}/block", response_model=FriendRow)
async def block_user(
	user_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> FriendRow:
	request_id = get_request_id(request)
	try:
		return await service.block_user(auth_user, user_id)
	except (InviteForbidden, BlockLimitExceeded) as exc:
		raise _map_error(exc, request_id) from None


@router.post("/friends/{user_id}/unblock")
async def unblock_user(
	user_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	request_id = get_request_id(request)
	try:
		await service.unblock_user(auth_user, user_id)
	except Exception as exc:
		raise _map_error(exc, request_id) from None
	return {"status": "ok"}


@router.post("/friends/{user_id}/remove")
async def remove_friend(
	user_id: UUID,
	request: Request,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	request_id = get_request_id(request)
	try:
		await service.remove_friend(auth_user, user_id)
	except Exception as exc:
		raise _map_error(exc, request_id) from None
	return {"status": "ok"}

	return {"status": "ok"}


@router.get("/notifications", response_model=List[dict])
async def list_notifications(
	limit: int = Query(default=20, ge=1, le=100),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[dict]:
	service = notifications.NotificationService()
	items = await service.get_my_notifications(auth_user.id, limit=limit)
	return [item.to_dict() for item in items]


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	service = notifications.NotificationService()
	await service.mark_all_read(auth_user.id)
	return {"status": "ok"}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
	notification_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	service = notifications.NotificationService()
	await service.mark_read(auth_user.id, notification_id)
	return {"status": "ok"}


@router.get("/notifications/unread")
async def unread_notifications(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	service = notifications.NotificationService()
	count = await service.get_unread_count(auth_user.id)
	return {"unread": count}


@router.get("/friends/{target_id}/mutual", response_model=List[MutualFriend])
async def mutual_friends(
	target_id: UUID,
	limit: int = 5,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[MutualFriend]:
	return await service.list_mutual_friends(auth_user, str(target_id), limit)

@router.get("/usage", response_model=SocialUsageResponse)
async def get_social_usage(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> SocialUsageResponse:
	from app.domain.xp.service import XPService
	xp_stats = await XPService().get_user_stats(auth_user.id)
	limit = LEVEL_INVITE_LIMITS.get(xp_stats.current_level, 200)
	usage = await policy.get_current_usage(str(auth_user.id))
	print(f"DEBUG: usage user={auth_user.id} level={xp_stats.current_level} limit={limit} usage={usage}")
	return SocialUsageResponse(daily_limit=limit, daily_usage=usage)
