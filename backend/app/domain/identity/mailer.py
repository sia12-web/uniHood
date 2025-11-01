"""Stub mailer for identity security flows."""

from __future__ import annotations

import hashlib
import logging

from app.domain.identity import audit

logger = logging.getLogger(__name__)


def _hash_email(email: str) -> str:
	masked = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()
	return masked[:12]


def mask_email(email: str) -> str:
	return _hash_email(email)


async def send_password_reset(email: str, link: str, *, user_id: str | None = None) -> None:
	"""Send a password reset email (stub) and emit audit trail.

	A real implementation would enqueue an email job. We log a masked email hash for
	audit purposes to avoid leaking sensitive information into logs.
	"""
	mask = _hash_email(email)
	logger.info("password_reset_email_stub", extra={"email_hash": mask})
	await audit.log_event(
		"pwreset_email_stubbed",
		user_id=user_id,
		meta={"email_hash": mask, "link": "redacted"},
	)


async def send_deletion_confirmation(email: str, token: str, *, user_id: str | None = None) -> None:
	mask = _hash_email(email)
	logger.info("account_delete_email_stub", extra={"email_hash": mask})
	await audit.log_event(
		"delete_email_stubbed",
		user_id=user_id,
		meta={"email_hash": mask, "token": "redacted"},
	)


async def send_email_change_confirmation(new_email: str, token: str, *, user_id: str | None = None) -> None:
	mask = _hash_email(new_email)
	logger.info("email_change_stub", extra={"email_hash": mask})
	await audit.log_event(
		"email_change_stubbed",
		user_id=user_id,
		meta={"email_hash": mask, "token": "redacted"},
	)


async def send_email_verification(email: str, token: str, *, user_id: str | None = None) -> None:
	mask = _hash_email(email)
	logger.info("email_verify_stub", extra={"email_hash": mask})
	await audit.log_event(
		"email_verify_stubbed",
		user_id=user_id,
		meta={"email_hash": mask, "token": "redacted"},
	)
