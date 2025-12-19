"""Session management helpers for identity security flows.

HARDENING:
- Hash refresh tokens with a server-side pepper and store only hashes.
- Implement rotation and reuse detection; on reuse, revoke all sessions.
- Issue JWT access tokens with issuer/audience and required claims.
- Use constant-time comparisons for token checks.
"""

from __future__ import annotations

import secrets
import hmac
import hashlib
import time
import os
from datetime import datetime, timezone
from typing import Iterable, Mapping, Optional
from uuid import UUID, uuid4

import asyncpg

from app.domain.identity import audit, models, policy, risk, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.infra import jwt as jwt_helper
from app.settings import settings

ACCESS_TTL_SECONDS = settings.access_ttl_minutes * 60
REFRESH_TTL_SECONDS = settings.refresh_ttl_days * 24 * 60 * 60
REFRESH_PEPPER = os.getenv("REFRESH_PEPPER", "dev-pepper")


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _h(token: str) -> str:
	return hashlib.sha256((REFRESH_PEPPER + token).encode()).hexdigest()


def _hash_fingerprint(fingerprint: str) -> str:
	"""Hash device fingerprint for storage. Uses SHA-256 without pepper since fingerprint is already random."""
	return hashlib.sha256(fingerprint.encode()).hexdigest()


def _refresh_store_key(session_id: UUID | str) -> str:
	return f"session:refresh:{session_id}"


def _refresh_used_key(token_hash: str) -> str:
	return f"session:refresh:used:{token_hash}"


def _build_access_token(user: models.User, session_id: UUID) -> str:
	now = int(time.time())
	exp = now + ACCESS_TTL_SECONDS
	payload = {
		"sub": str(user.id),
		"sid": str(session_id),
		"campus_id": str(user.campus_id or ""),
		"ver": 1,
		"scp": ["user"],
		"handle": user.handle,
		"name": user.display_name,
		"exp": exp,
		"iat": now,
	}
	return jwt_helper.encode_access(payload)


def build_access_token_for_session(user: models.User, session_id: UUID) -> str:
	"""Build an access token for an existing session.

	This is used when user attributes (e.g., campus_id) change during onboarding,
	and the frontend needs a fresh access token without rotating refresh tokens.
	"""
	return _build_access_token(user, session_id)


async def _store_refresh_token(session_id: UUID, token: str) -> None:
	token_hash = _h(token)
	await redis_client.set(_refresh_store_key(session_id), token_hash, ex=REFRESH_TTL_SECONDS)


async def _mark_used(token_hash: str) -> None:
	# Track used hashes for reuse detection after rotation
	ttl = max(REFRESH_TTL_SECONDS, 32 * 24 * 60 * 60)  # keep at least ~32d
	await redis_client.set(_refresh_used_key(token_hash), "1", ex=ttl)


async def _delete_refresh_token(session_id: UUID | str) -> None:
	await redis_client.delete(_refresh_store_key(session_id))


async def _fetch_refresh_token(session_id: UUID | str) -> Optional[str]:
	return await redis_client.get(_refresh_store_key(session_id))


async def _insert_session(
	conn: asyncpg.Connection,
	session_id: UUID,
	user_id: UUID,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str,
	fingerprint_hash: Optional[str] = None,
) -> None:
	await conn.execute(
		"""
		INSERT INTO sessions (id, user_id, ip, user_agent, device_label, fingerprint_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
		""",
		session_id,
		user_id,
		ip,
		user_agent,
		device_label,
		fingerprint_hash,
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
	fingerprint: Optional[str] = None,
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

	# Hash fingerprint for storage if provided
	fingerprint_hash = _hash_fingerprint(fingerprint) if fingerprint else None

	pool = await get_pool()
	async with pool.acquire() as conn:
		await _insert_session(conn, session_id, user.id, ip, user_agent, device_label.strip()[:100], fingerprint_hash)
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
	fingerprint: Optional[str] = None,
) -> schemas.LoginResponse:
	"""Rotate a refresh token for an existing session.
	
	Validates device fingerprint if session has one stored (S1-backend-01 compliance).
	"""
	persisted_hash = await _fetch_refresh_token(session_id)
	if not persisted_hash:
		raise policy.IdentityPolicyError("refresh_invalid")
	
	# Validate fingerprint if session has one stored
	pool = await get_pool()
	async with pool.acquire() as conn:
		stored_fp_hash = await conn.fetchval(
			"SELECT fingerprint_hash FROM sessions WHERE id = $1",
			session_id,
		)
	if stored_fp_hash:
		if not fingerprint:
			# Session requires fingerprint but none provided
			await audit.log_event(
				"refresh_fingerprint_missing",
				user_id=str(user.id),
				meta={"session_id": str(session_id)},
			)
			raise policy.IdentityPolicyError("refresh_invalid")
		presented_fp_hash = _hash_fingerprint(fingerprint)
		if not hmac.compare_digest(stored_fp_hash, presented_fp_hash):
			# Fingerprint mismatch - potential token theft
			await audit.log_event(
				"refresh_fingerprint_mismatch",
				user_id=str(user.id),
				meta={"session_id": str(session_id)},
			)
			raise policy.IdentityPolicyError("refresh_invalid")
	
	presented_hash = _h(refresh_token)
	if not hmac.compare_digest(persisted_hash, presented_hash):
		# Check reuse detection: has this hash been seen (rotated) already?
		if await redis_client.exists(_refresh_used_key(presented_hash)):
			# Reuse detected: revoke all sessions and force re-auth
			await revoke_all_sessions(str(user.id))
			await audit.log_event(
				"refresh_reuse_detected",
				user_id=str(user.id),
				meta={"session_id": str(session_id)},
			)
			raise policy.IdentityPolicyError("refresh_reuse")
		# Otherwise invalid token
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
	# Mark the previous hash as used, then store the new one
	await _mark_used(persisted_hash)
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
