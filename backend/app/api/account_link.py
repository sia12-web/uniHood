"""Account linking API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.identity import linking, models, policy, schemas
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool

router = APIRouter(prefix="/account/link", tags=["account"])


async def _load_user(auth_user: AuthenticatedUser) -> models.User:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
	if not row:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")
	return models.User.from_record(row)


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = exc.reason
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"link_conflict", "link_last_method"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
	if reason in {"link_not_found"}:
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.get("/providers", response_model=list[str])
async def list_providers(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[str]:
	user = await _load_user(auth_user)
	return list(await linking.available_providers(user))


@router.get("/list", response_model=list[schemas.LinkedAccountOut])
async def list_linked(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.LinkedAccountOut]:
	return await linking.list_linked_accounts(auth_user.id)


@router.get("/start", response_model=schemas.LinkStartResponse)
async def start_link_endpoint(
	provider: str = Query(..., pattern=r"^[a-z]+$"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.LinkStartResponse:
	try:
		return await linking.start_link(provider, auth_user)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None


@router.get("/callback")
async def complete_link_endpoint(
	provider: str = Query(...),
	subject: str = Query(...),
	email: str | None = Query(default=None),
	auth_user: AuthenticatedUser = Depends(get_current_user),
):
	user = await _load_user(auth_user)
	try:
		await linking.complete_link(user, provider=provider, subject=subject, email=email)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "linked"}


@router.delete("/{provider}")
async def unlink_provider(provider: str, auth_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
	try:
		await linking.unlink_identity(auth_user.id, provider)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "ok"}
