"""Stub SMS sender interface used for phone verification flows."""

from __future__ import annotations

import hashlib
import logging
import random

logger = logging.getLogger(__name__)
_RNG = random.SystemRandom()


def generate_otp() -> str:
	"""Generate a 6-digit numeric OTP using a cryptographically safe RNG."""
	return f"{_RNG.randint(0, 999999):06d}"


def _mask_number(e164: str) -> str:
	if len(e164) <= 4:
		return e164
	return f"{e164[:-4]}XXXX"


def _hash_number(e164: str) -> str:
	return hashlib.sha256(e164.encode("utf-8")).hexdigest()[:12]


async def send_sms_code(e164: str, code: str, *, template: str = "verify") -> None:
	"""Stub sending routine that logs the event without disclosing PII."""
	masked = _mask_number(e164)
	digest = _hash_number(e164)
	logger.info(
		"sms_stub_send",
		extra={"to_masked": masked, "hash": digest, "template": template, "code": "redacted"},
	)
