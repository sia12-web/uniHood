"""Session management helpers for identity security flows."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Iterable, Mapping, Optional
from uuid import UUID, uuid4

import asyncpg

from app.domain.identity import audit, models, policy, risk, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client

ACCESS_TTL_SECONDS = policy.ACCESS_TTL_MINUTES * 60
REFRESH_TTL_SECONDS = policy.REFRESH_TTL_DAYS * 24 * 60 * 60


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _refresh_key(session_id: UUID | str) -> str:
	return f"session:refresh:{session_id}"


def _build_access_token(user: models.User, session_id: UUID) -> str:
	campus = str(user.campus_id) if user.campus_id else ""
	handle_fragment = f";handle:{user.handle}" if user.handle else ""
	return f"uid:{user.id};campus:{campus};sid:{session_id}{handle_fragment}"


async def _store_refresh_token(session_id: UUID, token: str) -> None:
	await redis_client.set(_refresh_key(session_id), token, ex=REFRESH_TTL_SECONDS)


async def _delete_refresh_token(session_id: UUID | str) -> None:
	await redis_client.delete(_refresh_key(session_id))


async def _fetch_refresh_token(session_id: UUID | str) -> Optional[str]:
	return await redis_client.get(_refresh_key(session_id))


async def _insert_session(
	conn: asyncpg.Connection,
	session_id: UUID,
	user_id: UUID,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str,
) -> None:
	await conn.execute(
		"""
		INSERT INTO sessions (id, user_id, ip, user_agent, device_label)
		VALUES ($1, $2, $3, $4, $5)
		""",
		session_id,
		user_id,
		ip,
		user_agent,
		device_label,
	)


async def _delete_session(session_id: UUID) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute("DELETE FROM sessions WHERE id = $1", session_id)


async def issue_session_tokens(
	user: models.User,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str = "",
 	risk_geo: Optional[Mapping[str, object]] = None,
) -> schemas.LoginResponse:
	"""Create a session row and issue access/refresh tokens."""
	session_id = uuid4()
	refresh_token = secrets.token_urlsafe(48)
	access_token = _build_access_token(user, session_id)
	pair = schemas.LoginResponse(
		user_id=user.id,
		access_token=access_token,
		refresh_token=refresh_token,
		session_id=session_id,
		expires_in=ACCESS_TTL_SECONDS,
	)
	pair.twofa_required = False
	pair.challenge_id = None

	pool = await get_pool()
	async with pool.acquire() as conn:
		await _insert_session(conn, session_id, user.id, ip, user_agent, device_label.strip()[:100])
	await _store_refresh_token(session_id, refresh_token)
	audit.inc_session_created()
	await audit.log_event(
		"session_created",
		user_id=str(user.id),
		meta={"session_id": str(session_id), "ip": ip or "", "ua": (user_agent or "")[:120]},
	)
	assessment = await risk.evaluate_login(
		user,
		session_id,
		ip=ip,
		user_agent=user_agent,
		geo=risk_geo,
	)
	pair.risk_score = assessment.score
	pair.step_up_required = assessment.step_up_required
	if assessment.blocked:
		await _delete_refresh_token(session_id)
		await _delete_session(session_id)
		raise policy.IdentityPolicyError("login_blocked")
	if assessment.step_up_required:
		reauth_token = secrets.token_urlsafe(32)
		await policy.stash_reauth_token(str(user.id), reauth_token)
		pair.reauth_token = reauth_token
	return pair


async def refresh_session(
	user: models.User,
	*,
	session_id: UUID,
	refresh_token: str,
	ip: Optional[str],
	user_agent: Optional[str],
) -> schemas.LoginResponse:
	"""Rotate a refresh token for an existing session."""
	persisted = await _fetch_refresh_token(session_id)
	if persisted is None or persisted != refresh_token:
		raise policy.IdentityPolicyError("refresh_invalid")
	new_refresh = secrets.token_urlsafe(48)
	new_access = _build_access_token(user, session_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.execute(
			"""
			UPDATE sessions
			SET last_used_at = NOW(), ip = COALESCE($3, ip), user_agent = COALESCE($4, user_agent)
			WHERE id = $1 AND user_id = $2 AND revoked = FALSE
			""",
			session_id,
			user.id,
			ip,
			user_agent,
		)
	if rows.endswith("0"):
		raise policy.IdentityPolicyError("session_revoked")
	await _store_refresh_token(session_id, new_refresh)
	return schemas.LoginResponse(
		user_id=user.id,
		access_token=new_access,
		refresh_token=new_refresh,
		session_id=session_id,
		expires_in=ACCESS_TTL_SECONDS,
	)


async def list_sessions(user_id: str, *, limit: int = 50) -> list[tuple[models.Session, Optional[models.SessionRisk]]]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT s.*, r.risk_score, r.reasons, r.step_up_required, r.created_at AS risk_created_at, r.updated_at AS risk_updated_at
			FROM sessions s
			LEFT JOIN session_risk r ON r.session_id = s.id
			WHERE s.user_id = $1
			ORDER BY s.last_used_at DESC
			LIMIT $2
			""",
			user_id,
			limit,
		)
	results: list[tuple[models.Session, Optional[models.SessionRisk]]] = []
	for row in rows:
		session = models.Session.from_record(row)
		risk_record: Optional[models.SessionRisk] = None
		if row.get("risk_score") is not None:
			mapped = {
				"session_id": row["id"],
				"risk_score": row["risk_score"],
				"reasons": row.get("reasons") or [],
				"step_up_required": row.get("step_up_required", False),
				"created_at": row.get("risk_created_at") or row.get("created_at"),
				"updated_at": row.get("risk_updated_at") or row.get("updated_at"),
			}
			risk_record = models.SessionRisk.from_record(mapped)
		results.append((session, risk_record))
	return results


async def set_session_label(user_id: str, session_id: UUID, label: str) -> None:
	padded = label.strip()[:100]
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			UPDATE sessions
			SET device_label = $3
			WHERE id = $1 AND user_id = $2
			""",
			session_id,
			user_id,
			padded,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("session_not_found")
	await audit.log_event(
		"session_labeled",
		user_id=user_id,
		meta={"session_id": str(session_id), "label": padded},
	)


async def revoke_session(user_id: str, session_id: UUID) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			UPDATE sessions
			SET revoked = TRUE, last_used_at = NOW()
			WHERE id = $1 AND user_id = $2
			""",
			session_id,
			user_id,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("session_not_found")
	await _delete_refresh_token(session_id)
	audit.inc_session_revoked()
	await audit.log_event(
		"session_revoked",
		user_id=user_id,
		meta={"session_id": str(session_id)},
	)


async def revoke_sessions(user_id: str, session_ids: Iterable[UUID]) -> None:
	for sid in session_ids:
		await revoke_session(user_id, sid)


async def revoke_all_sessions(user_id: str) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT id FROM sessions WHERE user_id = $1", user_id)
		await conn.execute(
			"""
			UPDATE sessions SET revoked = TRUE, last_used_at = NOW()
			WHERE user_id = $1
			""",
			user_id,
		)
	for row in rows:
		await _delete_refresh_token(row["id"])
	audit.inc_session_revoked()
	await audit.log_event("session_revoked_all", user_id=user_id, meta={"count": str(len(rows))})
