"""Account linking helpers for OAuth identity consolidation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID, uuid4

import asyncpg

from app.domain.identity import audit, flags, models, oauth, policy, schemas
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics

SUPPORTED_PROVIDERS: tuple[str, ...] = ("google", "microsoft", "apple")


@dataclass(slots=True)
class LinkContext:
	user: models.User
	providers: tuple[str, ...]
	linked: list[schemas.LinkedAccountOut]


def _normalise_provider(provider: str) -> str:
	value = provider.strip().lower()
	if value not in SUPPORTED_PROVIDERS:
		raise policy.IdentityPolicyError("link_provider_invalid")
	return value


async def _apple_enabled(user: models.User) -> bool:
	if not user.id:
		return False
	flag = await flags.evaluate_flag(
		"identity.apple_sso",
		user_id=str(user.id),
		campus_id=str(user.campus_id) if user.campus_id else None,
	)
	return bool(flag.enabled)


async def available_providers(user: models.User) -> tuple[str, ...]:
	providers = ["google", "microsoft"]
	if await _apple_enabled(user):
		providers.append("apple")
	return tuple(providers)


async def list_linked_accounts(user_id: str) -> list[schemas.LinkedAccountOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		raws = await conn.fetch(
			"""
			SELECT id, user_id, provider, subject, email, created_at
			FROM oauth_identities
			WHERE user_id = $1
			ORDER BY created_at ASC
			""",
			user_id,
		)
	return [
		schemas.LinkedAccountOut(
			id=row["id"],
			provider=row["provider"],
			subject=row["subject"],
			email=row.get("email"),
			created_at=row["created_at"],
		)
		for row in raws
	]


async def start_link(provider: str, auth_user: AuthenticatedUser) -> schemas.LinkStartResponse:
	provider_norm = _normalise_provider(provider)
	await policy.enforce_account_link_start_rate(auth_user.id)
	oauth_payload = await oauth.start(provider_norm, auth_user)
	return schemas.LinkStartResponse(
		authorize_url=oauth_payload.authorize_url,
		state=oauth_payload.state,
		code_verifier=oauth_payload.code_verifier,
		code_challenge=oauth_payload.code_challenge,
	)


async def _ensure_unique_subject(conn: asyncpg.Connection, provider: str, subject: str, user_id: str) -> None:
	existing = await conn.fetchrow(
		"""
		SELECT user_id
		FROM oauth_identities
		WHERE provider = $1 AND subject = $2
		""",
		provider,
		subject,
	)
	if existing and str(existing["user_id"]) != user_id:
		raise policy.IdentityPolicyError("link_conflict")


async def _insert_identity(
	conn: asyncpg.Connection,
	*,
	user_id: str,
	provider: str,
	subject: str,
	email: str | None,
) -> schemas.LinkedAccountOut:
	row = await conn.fetchrow(
		"""
		INSERT INTO oauth_identities (id, user_id, provider, subject, email)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (provider, subject)
		DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email
		RETURNING id, user_id, provider, subject, email, created_at
		""",
		uuid4(),
		user_id,
		provider,
		subject,
		email,
	)
	return schemas.LinkedAccountOut(
		id=row["id"],
		provider=row["provider"],
		subject=row["subject"],
		email=row.get("email"),
		created_at=row["created_at"],
	)


async def complete_link(user: models.User, *, provider: str, subject: str, email: str | None) -> schemas.LinkedAccountOut:
	provider_norm = _normalise_provider(provider)
	subject_norm = subject.strip()
	if not subject_norm:
		raise policy.IdentityPolicyError("link_subject_missing")
	await policy.enforce_account_link_start_rate(str(user.id))
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_unique_subject(conn, provider_norm, subject_norm, str(user.id))
			linked = await _insert_identity(
				conn,
				user_id=str(user.id),
				provider=provider_norm,
				subject=subject_norm,
				email=email.lower() if email else None,
			)
	obs_metrics.inc_account_link(provider_norm, "add")
	await audit.log_event(
		"account_link_added",
		user_id=str(user.id),
		meta={"provider": provider_norm, "subject": subject_norm[:40]},
	)
	return linked


async def _has_password(conn: asyncpg.Connection, user_id: str) -> bool:
	row = await conn.fetchrow("SELECT password_hash FROM users WHERE id = $1", user_id)
	if not row:
		raise policy.IdentityPolicyError("user_not_found")
	password_hash = row.get("password_hash")
	return bool(password_hash)


async def _passkey_count(conn: asyncpg.Connection, user_id: str) -> int:
	count = await conn.fetchval("SELECT COUNT(*) FROM authenticators WHERE user_id = $1", user_id)
	return int(count or 0)


async def _linked_count(conn: asyncpg.Connection, user_id: str) -> int:
	count = await conn.fetchval("SELECT COUNT(*) FROM oauth_identities WHERE user_id = $1", user_id)
	return int(count or 0)


async def unlink_identity(user_id: str, provider: str) -> None:
	provider_norm = _normalise_provider(provider)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			row = await conn.fetchrow(
				"""
				SELECT id, provider, subject
				FROM oauth_identities
				WHERE user_id = $1 AND provider = $2
				FOR UPDATE
				""",
				user_id,
				provider_norm,
			)
			if not row:
				raise policy.IdentityPolicyError("link_not_found")
			linked_total = await _linked_count(conn, user_id)
			passkeys = await _passkey_count(conn, user_id)
			has_password = await _has_password(conn, user_id)
			remaining = (linked_total - 1) + passkeys + (1 if has_password else 0)
			if remaining <= 0:
				raise policy.IdentityPolicyError("link_last_method")
			await conn.execute(
				"DELETE FROM oauth_identities WHERE user_id = $1 AND provider = $2",
				user_id,
				provider_norm,
			)
	obs_metrics.inc_account_link(provider_norm, "remove")
	await audit.log_event(
		"account_link_removed",
		user_id=user_id,
		meta={"provider": provider_norm},
	)


async def ensure_linkable_providers(user: models.User) -> LinkContext:
	providers = await available_providers(user)
	linked = await list_linked_accounts(str(user.id))
	return LinkContext(user=user, providers=providers, linked=linked)


async def ensure_link_for_signin(
	user: models.User,
	*,
	provider: str,
	subject: str,
	email: str | None,
) -> schemas.LinkedAccountOut:
	"""Helper used when user signs in with an OAuth provider first time."""
	linked_accounts = await list_linked_accounts(str(user.id))
	for account in linked_accounts:
		if account.provider == provider and account.subject == subject:
			return account
	return await complete_link(user, provider=provider, subject=subject, email=email)
