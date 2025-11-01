"""Trust level computation and badge issuance helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.domain.identity import models, policy, schemas
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics

DEFAULT_TRUST_EXPIRY_DAYS = 365


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _compute_badge(level: int) -> Optional[str]:
	if level >= 2:
		return "verified_plus"
	if level >= 1:
		return "verified"
	return None


async def _load_current_profile(conn, user_id: str) -> Optional[models.TrustProfile]:
	row = await conn.fetchrow(
		"""
		SELECT user_id, trust_level, badge, verified_at, expires_at, updated_at
		FROM trust_profiles
		WHERE user_id = $1
		""",
		user_id,
	)
	return models.TrustProfile.from_record(row) if row else None


async def recompute_trust(user_id: str) -> schemas.TrustProfileOut:
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			user_row = await conn.fetchrow(
				"SELECT email_verified FROM users WHERE id = $1",
				user_id,
			)
			if not user_row:
				raise policy.IdentityPolicyError("user_missing")
			email_verified = bool(user_row.get("email_verified"))

			rows = await conn.fetch(
				"""
				SELECT method, expires_at
				FROM verifications
				WHERE user_id = $1
				  AND state = 'approved'
				  AND (expires_at IS NULL OR expires_at > NOW())
				""",
				user_id,
			)

			existing_profile = await _load_current_profile(conn, user_id)
			now = _utcnow()
			expires_at: Optional[datetime] = None
			has_doc = False
			has_sso = False
			for row in rows:
				method = row["method"]
				if method == "doc":
					has_doc = True
				elif method == "sso":
					has_sso = True
				candidate = row.get("expires_at")
				if candidate is not None:
					expires_at = candidate if expires_at is None else min(expires_at, candidate)

			level = 0
			if email_verified:
				level = max(level, 1)
			if has_doc:
				level = max(level, 2)
			if has_sso and has_doc:
				level = max(level, 3)

			if level > 0 and expires_at is None:
				expires_at = now + timedelta(days=DEFAULT_TRUST_EXPIRY_DAYS)
			if level == 0:
				expires_at = None

			badge = _compute_badge(level)
			verified_at = existing_profile.verified_at if existing_profile else None
			if level == 0:
				verified_at = None
			elif verified_at is None:
				verified_at = now

			await conn.execute(
				"""
				INSERT INTO trust_profiles (user_id, trust_level, badge, verified_at, expires_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, NOW())
				ON CONFLICT (user_id)
				DO UPDATE SET
					trust_level = EXCLUDED.trust_level,
					badge = EXCLUDED.badge,
					verified_at = EXCLUDED.verified_at,
					expires_at = EXCLUDED.expires_at,
					updated_at = NOW()
				""",
				user_id,
				level,
				badge,
				verified_at,
				expires_at,
			)

	obs_metrics.inc_verify_trust_recompute()
	return schemas.TrustProfileOut(
		trust_level=level,
		badge=badge,
		verified_at=verified_at,
		expires_at=expires_at,
	)
