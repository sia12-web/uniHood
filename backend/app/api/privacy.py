"""Privacy, notification, export, deletion, and audit endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.identity import (
	audit,
	deletion,
	export,
	notifications,
	policy,
	privacy,
	schemas,
)
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter()


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = exc.reason
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"block_exists"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
	if reason in {"block_missing", "user_missing", "export_not_found", "delete_not_requested"}:
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
	if reason in {"block_self"}:
		return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)
	if reason in {"delete_token_invalid"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.get("/settings/privacy", response_model=schemas.PrivacySettings)
async def get_privacy(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.PrivacySettings:
	try:
		return await privacy.get_privacy_settings(auth_user.id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.patch("/settings/privacy", response_model=schemas.PrivacySettings)
async def patch_privacy(
	payload: schemas.PrivacySettingsPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PrivacySettings:
	try:
		return await privacy.update_privacy_settings(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/privacy/blocks", response_model=list[schemas.BlockListEntry])
async def get_blocks(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.BlockListEntry]:
	return await privacy.list_blocks(auth_user.id)


@router.post("/privacy/block/{target_id}", response_model=schemas.BlockListEntry)
async def post_block(
	target_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.BlockListEntry:
	try:
		return await privacy.block_user(auth_user, target_id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.delete("/privacy/block/{target_id}")
async def delete_block(
	target_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	try:
		await privacy.unblock_user(auth_user, target_id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"unblocked": True}


@router.get("/settings/notifications", response_model=schemas.NotificationPreferences)
async def get_notifications(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.NotificationPreferences:
	return await notifications.get_preferences(auth_user.id)


@router.patch("/settings/notifications", response_model=schemas.NotificationPreferences)
async def patch_notifications(
	payload: schemas.NotificationPreferencesPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.NotificationPreferences:
	return await notifications.update_preferences(auth_user.id, payload)


@router.post("/account/export/request", response_model=schemas.ExportStatus)
async def request_export(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ExportStatus:
	try:
		return await export.request_export(auth_user)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/account/export/status", response_model=schemas.ExportStatus)
async def get_export_status(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ExportStatus:
	status_info = await export.get_status(auth_user.id)
	if not status_info:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="export_not_found")
	return status_info


@router.get("/account/export/download", response_model=schemas.ExportStatus)
async def get_export_download(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ExportStatus:
	status_info = await export.get_status(auth_user.id)
	if not status_info:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="export_not_found")
	if status_info.status != "ready":
		raise HTTPException(status.HTTP_409_CONFLICT, detail="export_pending")
	return status_info


@router.post("/account/delete/request", response_model=schemas.DeletionStatus)
async def post_delete_request(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.DeletionStatus:
	try:
		return await deletion.request_deletion(auth_user)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/account/delete/confirm", response_model=schemas.DeletionStatus)
async def post_delete_confirm(
	payload: schemas.DeletionConfirm,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.DeletionStatus:
	try:
		return await deletion.confirm_deletion(auth_user, payload.token)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/account/delete/force", response_model=schemas.DeletionStatus)
async def post_delete_force(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.DeletionStatus:
	"""Immediate, tokenless deletion for the authenticated user (development convenience)."""
	try:
		return await deletion.force_delete(auth_user)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/account/delete/status", response_model=schemas.DeletionStatus)
async def get_delete_status(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.DeletionStatus:
	try:
		return await deletion.get_status(auth_user.id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/account/audit", response_model=schemas.AuditLogPage)
async def get_audit_log(
	limit: int = Query(default=50, ge=1, le=policy.AUDIT_PAGE_MAX),
	cursor: int | None = Query(default=None, ge=1),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.AuditLogPage:
	entries, next_cursor = await audit.fetch_audit_log(auth_user.id, limit=limit, cursor=cursor)
	items = [
		schemas.AuditLogItem(
			id=entry.id,
			event=entry.event,
			meta={k: str(v) for k, v in entry.meta.items()},
			created_at=entry.created_at,
		)
		for entry in entries
	]
	return schemas.AuditLogPage(items=items, cursor=next_cursor)
