"""Attestation helper utilities for WebAuthn passkey flows."""

from __future__ import annotations

from typing import Iterable, Sequence

from app.domain.identity import policy

_VALID_TRANSPORTS = {"internal", "usb", "ble", "nfc", "hybrid"}
_ALLOWED_ATTESTATION_FORMATS = {"packed", "apple", "android-safetynet", "fido-u2f"}


def sanitize_label(label: str | None, *, default: str = "") -> str:
	"""Normalise a device label respecting policy constraints."""
	value = policy.normalise_device_label(label)
	if not value:
		value = default.strip()[: policy.DEVICE_LABEL_MAX]
	policy.guard_device_label(value)
	return value


def normalize_transports(transports: Iterable[str] | None) -> list[str]:
	"""Filter transports to a stable sorted list of allowed values."""
	if not transports:
		return []
	unique = {transport.strip().lower() for transport in transports if transport}
	filtered = unique.intersection(_VALID_TRANSPORTS)
	return sorted(filtered)


def ensure_attestation_allowed(fmt: str | None, *, allow_direct: bool) -> None:
	"""Validate the attestation format against deployment policy."""
	if fmt is None or fmt == "":
		return
	lower = fmt.lower()
	if lower == "none":
		return
	if lower not in _ALLOWED_ATTESTATION_FORMATS:
		raise policy.IdentityPolicyError("attestation_unsupported")
	if not allow_direct:
		raise policy.IdentityPolicyError("attestation_disallowed")


def select_attestation(fmt_candidates: Sequence[str] | None, *, allow_direct: bool) -> str | None:
	"""Choose a preferred attestation format from the authenticator signal."""
	if not fmt_candidates:
		return None
	for candidate in fmt_candidates:
		if candidate is None:
			continue
		name = candidate.lower()
		if name == "none":
			return "none"
		if name in _ALLOWED_ATTESTATION_FORMATS:
			if allow_direct:
				return name
	return "none" if allow_direct else None
