"""Domain models for the identity and profile subsystem."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import json
from typing import Any, Mapping, Optional, Sequence
from uuid import UUID

RecordLike = Mapping[str, Any]


def _as_uuid(value: Any) -> UUID:
	if isinstance(value, UUID):
		return value
	return UUID(str(value))


def _as_bytes(value: Any) -> bytes:
	if value is None:
		return b""
	if isinstance(value, bytes):
		return value
	if isinstance(value, memoryview):  # type: ignore[name-defined]
		return value.tobytes()
	return bytes(value)


def _coerce_json_to_dict(value: Any) -> dict[str, Any]:
	if not value:
		return {}
	if isinstance(value, dict):
		return value
	if isinstance(value, (bytes, bytearray, memoryview)):
		# Postgres JSONB columns can arrive as text, bytes, or memoryview objects.
		try:
			decoded = bytes(value).decode("utf-8")
		except Exception:
			decoded = value
		value = decoded
	if isinstance(value, str):
		try:
			return json.loads(value)
		except json.JSONDecodeError:
			return {}
	if isinstance(value, Mapping):
		return dict(value)
	return {}


def _coerce_json_to_list(value: Any) -> list[str]:
	if not value:
		return []
	raw: Any = value
	if isinstance(raw, (bytes, bytearray, memoryview)):
		try:
			raw = bytes(raw).decode("utf-8")
		except Exception:
			raw = value
	if isinstance(raw, str):
		try:
			raw = json.loads(raw)
		except json.JSONDecodeError:
			return []
	if isinstance(raw, Mapping):
		items: Sequence[Any] = list(raw.values())
	elif isinstance(raw, (list, tuple, set)):
		items = list(raw)
	else:
		return []
	processed: list[str] = []
	for entry in items:
		if entry is None:
			continue
		txt = str(entry).strip()
		if txt:
			processed.append(txt)
	return processed


@dataclass(slots=True)
class ProfileImage:
	"""Lightweight representation of a gallery image stored on a profile."""

	key: str
	url: str
	uploaded_at: str = ""

	@classmethod
	def from_mapping(cls, data: Mapping[str, Any]) -> "ProfileImage | None":
		key = str(data.get("key") or "").strip()
		url = str(data.get("url") or "").strip()
		if not key or not url:
			return None
		uploaded_at_raw = data.get("uploaded_at")
		uploaded_at = str(uploaded_at_raw).strip() if uploaded_at_raw is not None else ""
		return cls(key=key, url=url, uploaded_at=uploaded_at)

	def to_dict(self) -> dict[str, str]:
		payload = {"key": self.key, "url": self.url}
		if self.uploaded_at:
			payload["uploaded_at"] = self.uploaded_at
		return payload


def parse_profile_gallery(value: Any) -> list[ProfileImage]:
	"""Normalise gallery payloads stored in Postgres JSON columns."""
	if not value:
		return []
	raw: Any = value
	if isinstance(raw, (bytes, bytearray, memoryview)):
		try:
			raw = bytes(raw).decode("utf-8")
		except Exception:
			raw = value
	if isinstance(raw, str):
		try:
			raw = json.loads(raw)
		except json.JSONDecodeError:
			return []
	items: Sequence[Any]
	if isinstance(raw, Mapping):
		items = [raw]
	elif isinstance(raw, (list, tuple, set)):
		items = list(raw)
	else:
		return []
	images: list[ProfileImage] = []
	for entry in items:
		if not isinstance(entry, Mapping):
			continue
		image = ProfileImage.from_mapping(entry)
		if image:
			images.append(image)
	return images


@dataclass(slots=True)
class Campus:
	"""Represents a campus location/tenant."""

	id: UUID
	name: str
	domain: Optional[str]

	@classmethod
	def from_record(cls, record: RecordLike) -> "Campus":
		return cls(
			id=_as_uuid(record["id"]),
			name=str(record.get("name", "")),
			domain=record.get("domain"),
		)


@dataclass(slots=True)
class User:
	"""Core user record."""

	id: UUID
	email: Optional[str]
	email_verified: bool
	handle: str
	display_name: str
	bio: str
	avatar_key: Optional[str]
	avatar_url: Optional[str]
	campus_id: Optional[UUID]
	privacy: dict[str, Any]
	status: dict[str, Any]
	password_hash: str
	created_at: datetime
	updated_at: datetime
	# Optional profile details; provide safe defaults to avoid breaking tests that construct User directly
	major: Optional[str] = None
	graduation_year: Optional[int] = None
	passions: list[str] = field(default_factory=list)
	profile_gallery: list[ProfileImage] = field(default_factory=list)

	@classmethod
	def from_record(cls, record: RecordLike) -> "User":
		handle = str(record.get("handle", ""))
		return cls(
			id=_as_uuid(record["id"]),
			email=record.get("email"),
			email_verified=bool(record.get("email_verified", False)),
			handle=handle,
			display_name=str(record.get("display_name") or handle),
			bio=str(record.get("bio", "")),
			avatar_key=record.get("avatar_key"),
			avatar_url=record.get("avatar_url"),
			campus_id=_as_uuid(record["campus_id"]) if record.get("campus_id") else None,
			privacy=_coerce_json_to_dict(record.get("privacy")),
			status=_coerce_json_to_dict(record.get("status")),
			password_hash=str(record.get("password_hash", "")),
			created_at=record.get("created_at"),
			updated_at=record.get("updated_at"),
			major=(str(record.get("major", "")).strip() or None),
			graduation_year=int(record.get("graduation_year")) if record.get("graduation_year") is not None else None,
			passions=_coerce_json_to_list(record.get("passions")),
			profile_gallery=parse_profile_gallery(record.get("profile_gallery")),
		)


@dataclass(slots=True)
class EmailVerification:
	"""Email verification token entry."""

	id: UUID
	user_id: UUID
	token: str
	expires_at: datetime
	created_at: datetime
	used_at: Optional[datetime]

	@classmethod
	def from_record(cls, record: RecordLike) -> "EmailVerification":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			token=str(record.get("token", "")),
			expires_at=record["expires_at"],
			created_at=record["created_at"],
			used_at=record.get("used_at"),
		)

	@property
	def is_used(self) -> bool:
		return self.used_at is not None

	@property
	def is_expired(self) -> bool:
		return self.expires_at <= datetime.now(self.expires_at.tzinfo or datetime.now().tzinfo)


@dataclass(slots=True)
class Session:
	"""Represents a refresh session/device."""

	id: UUID
	user_id: UUID
	created_at: datetime
	last_used_at: datetime
	ip: Optional[str]
	user_agent: Optional[str]
	device_label: str
	revoked: bool

	@classmethod
	def from_record(cls, record: RecordLike) -> "Session":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			created_at=record["created_at"],
			last_used_at=record["last_used_at"],
			ip=record.get("ip"),
			user_agent=record.get("user_agent"),
			device_label=str(record.get("device_label", "")),
			revoked=bool(record.get("revoked", False)),
		)

	@property
	def is_active(self) -> bool:
		return not self.revoked


@dataclass(slots=True)
class Authenticator:
	"""Registered WebAuthn authenticator for a user."""

	id: UUID
	user_id: UUID
	cred_id: bytes
	public_key: bytes
	aaguid: Optional[UUID]
	transports: list[str]
	counter: int
	attestation_fmt: Optional[str]
	label: str
	created_at: datetime
	last_used_at: Optional[datetime]

	@classmethod
	def from_record(cls, record: RecordLike) -> "Authenticator":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			cred_id=_as_bytes(record.get("cred_id")),
			public_key=_as_bytes(record.get("public_key")),
			aaguid=_as_uuid(record["aaguid"]) if record.get("aaguid") else None,
			transports=list(record.get("transports") or []),
			counter=int(record.get("counter", 0)),
			attestation_fmt=record.get("attestation_fmt"),
			label=str(record.get("label", "")),
			created_at=record["created_at"],
			last_used_at=record.get("last_used_at"),
		)


@dataclass(slots=True)
class TrustedDevice:
	"""Device metadata used for trusted session tracking."""

	id: UUID
	user_id: UUID
	platform: str
	browser: str
	user_agent: str
	last_ip: Optional[str]
	first_seen: datetime
	last_seen: datetime
	label: str
	revoked: bool

	@classmethod
	def from_record(cls, record: RecordLike) -> "TrustedDevice":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			platform=str(record.get("platform", "")),
			browser=str(record.get("browser", "")),
			user_agent=str(record.get("user_agent", "")),
			last_ip=record.get("last_ip"),
			first_seen=record["first_seen"],
			last_seen=record["last_seen"],
			label=str(record.get("label", "")),
			revoked=bool(record.get("revoked", False)),
		)

	def mark_seen(self, when: datetime, ip: Optional[str]) -> "TrustedDevice":
		return TrustedDevice(
			id=self.id,
			user_id=self.user_id,
			platform=self.platform,
			browser=self.browser,
			user_agent=self.user_agent,
			last_ip=ip or self.last_ip,
			first_seen=self.first_seen,
			last_seen=when,
			label=self.label,
			revoked=self.revoked,
		)


	@dataclass(slots=True)
	class LinkedAccount:
		"""Linked OAuth identity for a user."""

		id: UUID
		user_id: UUID
		provider: str
		subject: str
		email: Optional[str]
		created_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "LinkedAccount":
			return cls(
				id=_as_uuid(record["id"]),
				user_id=_as_uuid(record["user_id"]),
				provider=str(record.get("provider", "")),
				subject=str(record.get("subject", "")),
				email=record.get("email"),
				created_at=record["created_at"],
			)


	@dataclass(slots=True)
	class EmailChangeRequest:
		"""Staged email change token awaiting confirmation."""

		id: UUID
		user_id: UUID
		new_email: str
		token: str
		expires_at: datetime
		used_at: Optional[datetime]
		created_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "EmailChangeRequest":
			return cls(
				id=_as_uuid(record["id"]),
				user_id=_as_uuid(record["user_id"]),
				new_email=str(record.get("new_email", "")),
				token=str(record.get("token", "")),
				expires_at=record["expires_at"],
				used_at=record.get("used_at"),
				created_at=record["created_at"],
			)

		@property
		def is_expired(self) -> bool:
			return self.expires_at <= datetime.now(self.expires_at.tzinfo or datetime.now().tzinfo)

		@property
		def is_used(self) -> bool:
			return self.used_at is not None


	@dataclass(slots=True)
	class UserPhone:
		"""Primary phone number associated with a user."""

		user_id: UUID
		e164: str
		verified: bool
		verified_at: Optional[datetime]
		created_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "UserPhone":
			return cls(
				user_id=_as_uuid(record["user_id"]),
				e164=str(record.get("e164", "")),
				verified=bool(record.get("verified", False)),
				verified_at=record.get("verified_at"),
				created_at=record["created_at"],
			)


	@dataclass(slots=True)
	class SessionRisk:
		"""Risk scoring metadata stored alongside a session."""

		session_id: UUID
		risk_score: int
		reasons: list[str]
		step_up_required: bool
		created_at: datetime
		updated_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "SessionRisk":
			return cls(
				session_id=_as_uuid(record["session_id"]),
				risk_score=int(record.get("risk_score", 0)),
				reasons=list(record.get("reasons") or []),
				step_up_required=bool(record.get("step_up_required", False)),
				created_at=record["created_at"],
				updated_at=record["updated_at"],
			)


	@dataclass(slots=True)
	class ContactHash:
		"""Hashed contact entry uploaded for discovery."""

		hash: str
		ref_kind: str
		created_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "ContactHash":
			return cls(
				hash=str(record.get("hash", "")),
				ref_kind=str(record.get("ref_kind", "")),
				created_at=record["created_at"],
			)


	@dataclass(slots=True)
	class ContactOptIn:
		"""User opt-in state for contact discovery."""

		user_id: UUID
		enabled: bool
		updated_at: datetime

		@classmethod
		def from_record(cls, record: RecordLike) -> "ContactOptIn":
			return cls(
				user_id=_as_uuid(record["user_id"]),
				enabled=bool(record.get("enabled", False)),
				updated_at=record["updated_at"],
			)

@dataclass(slots=True)
class TwoFactorSecret:
	"""Stores a user's two-factor secret state."""

	user_id: UUID
	secret: str
	enabled: bool
	created_at: datetime
	last_verified_at: Optional[datetime]

	@classmethod
	def from_record(cls, record: RecordLike) -> "TwoFactorSecret":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			secret=str(record.get("secret", "")),
			enabled=bool(record.get("enabled", False)),
			created_at=record["created_at"],
			last_verified_at=record.get("last_verified_at"),
		)


@dataclass(slots=True)
class PasswordResetToken:
	"""Represents a password reset token row."""

	id: UUID
	user_id: UUID
	token: str
	expires_at: datetime
	used_at: Optional[datetime]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "PasswordResetToken":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			token=str(record.get("token", "")),
			expires_at=record["expires_at"],
			used_at=record.get("used_at"),
			created_at=record["created_at"],
		)


@dataclass(slots=True)
class BlockEntry:
	"""Represents a user block record."""

	user_id: UUID
	blocked_id: UUID
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "BlockEntry":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			blocked_id=_as_uuid(record["blocked_id"]),
			created_at=record["created_at"],
		)


@dataclass(slots=True)
class NotificationPrefs:
	"""Notification preferences for a user."""

	user_id: UUID
	prefs: dict[str, Any]
	updated_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "NotificationPrefs":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			prefs=dict(record.get("prefs") or {}),
			updated_at=record["updated_at"],
		)

@dataclass(slots=True)
class Role:
	"""Represents an RBAC role."""

	id: UUID
	name: str
	description: str
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "Role":
		return cls(
			id=_as_uuid(record["id"]),
			name=str(record.get("name", "")),
			description=str(record.get("description", "")),
			created_at=record.get("created_at"),
		)


@dataclass(slots=True)
class Permission:
	"""Represents a flat RBAC permission action."""

	id: UUID
	action: str
	description: str

	@classmethod
	def from_record(cls, record: RecordLike) -> "Permission":
		return cls(
			id=_as_uuid(record["id"]),
			action=str(record.get("action", "")),
			description=str(record.get("description", "")),
		)


@dataclass(slots=True)
class UserRole:
	"""Assignment of a role to a user, optionally scoped to a campus."""

	user_id: UUID
	role_id: UUID
	role_name: str
	campus_id: Optional[UUID]
	granted_by: Optional[UUID]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "UserRole":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			role_id=_as_uuid(record["role_id"]),
			role_name=str(record.get("role_name", "")),
			campus_id=_as_uuid(record["campus_id"]) if record.get("campus_id") else None,
			granted_by=_as_uuid(record["granted_by"]) if record.get("granted_by") else None,
			created_at=record.get("created_at"),
		)


@dataclass(slots=True)
class FeatureFlag:
	"""Feature flag definition."""

	key: str
	description: str
	kind: str
	payload: dict[str, object]

	@classmethod
	def from_record(cls, record: RecordLike) -> "FeatureFlag":
		return cls(
			key=str(record.get("key", "")),
			description=str(record.get("description", "")),
			kind=str(record.get("kind", "")),
			payload=dict(record.get("payload") or {}),
		)


@dataclass(slots=True)
class FlagOverride:
	"""User or campus specific flag override."""

	key: str
	value: dict[str, object]
	user_id: Optional[UUID]
	campus_id: Optional[UUID]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "FlagOverride":
		return cls(
			key=str(record.get("key", "")),
			value=dict(record.get("value") or {}),
			user_id=_as_uuid(record["user_id"]) if record.get("user_id") else None,
			campus_id=_as_uuid(record["campus_id"]) if record.get("campus_id") else None,
			created_at=record.get("created_at"),
		)


@dataclass(slots=True)
class PolicyDocument:
	"""Versioned policy document requiring consent."""

	id: UUID
	slug: str
	version: str
	title: str
	content_md: str
	required: bool
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "PolicyDocument":
		return cls(
			id=_as_uuid(record["id"]),
			slug=str(record.get("slug", "")),
			version=str(record.get("version", "")),
			title=str(record.get("title", "")),
			content_md=str(record.get("content_md", "")),
			required=bool(record.get("required", True)),
			created_at=record.get("created_at"),
		)


@dataclass(slots=True)
class ConsentRecord:
	"""Represents a user's consent decision for a policy version."""

	user_id: UUID
	policy_slug: str
	version: str
	accepted: bool
	accepted_at: datetime
	meta: dict[str, object]

	@classmethod
	def from_record(cls, record: RecordLike) -> "ConsentRecord":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			policy_slug=str(record.get("policy_slug", "")),
			version=str(record.get("version", "")),
			accepted=bool(record.get("accepted", False)),
			accepted_at=record.get("accepted_at"),
			meta=dict(record.get("meta") or {}),
		)


@dataclass(slots=True)
class AuditLogEntry:
	"""Represents an audit log row."""

	id: int
	user_id: UUID
	event: str
	meta: dict[str, Any]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "AuditLogEntry":
		return cls(
			id=int(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			event=str(record.get("event", "")),
			meta=dict(record.get("meta") or {}),
			created_at=record["created_at"],
		)


@dataclass(slots=True)
class AccountDeletion:
	"""Account deletion request lifecycle state."""

	user_id: UUID
	requested_at: datetime
	confirmed_at: Optional[datetime]
	purged_at: Optional[datetime]

	@classmethod
	def from_record(cls, record: RecordLike) -> "AccountDeletion":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			requested_at=record["requested_at"],
			confirmed_at=record.get("confirmed_at"),
			purged_at=record.get("purged_at"),
		)


@dataclass(slots=True)
class Verification:
	"""Represents a verification attempt for a user."""

	id: UUID
	user_id: UUID
	method: str
	state: str
	evidence: dict[str, Any]
	reason: Optional[str]
	expires_at: Optional[datetime]
	created_at: datetime
	decided_at: Optional[datetime]

	@classmethod
	def from_record(cls, record: RecordLike) -> "Verification":
		return cls(
			id=_as_uuid(record["id"]),
			user_id=_as_uuid(record["user_id"]),
			method=str(record.get("method", "")),
			state=str(record.get("state", "")),
			evidence=dict(record.get("evidence") or {}),
			reason=record.get("reason"),
			expires_at=record.get("expires_at"),
			created_at=record["created_at"],
			decided_at=record.get("decided_at"),
		)


@dataclass(slots=True)
class TrustProfile:
	"""Aggregated trust state for a user."""

	user_id: UUID
	trust_level: int
	badge: Optional[str]
	verified_at: Optional[datetime]
	expires_at: Optional[datetime]
	updated_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "TrustProfile":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			trust_level=int(record.get("trust_level", 0)),
			badge=record.get("badge"),
			verified_at=record.get("verified_at"),
			expires_at=record.get("expires_at"),
			updated_at=record["updated_at"],
		)


@dataclass(slots=True)
class VerificationAudit:
	"""Moderator audit trail entry."""

	id: int
	verification_id: UUID
	moderator_id: UUID
	action: str
	note: Optional[str]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "VerificationAudit":
		return cls(
			id=int(record["id"]),
			verification_id=_as_uuid(record["verification_id"]),
			moderator_id=_as_uuid(record["moderator_id"]),
			action=str(record.get("action", "")),
			note=record.get("note"),
			created_at=record["created_at"],
		)


@dataclass(slots=True)
class Interest:
	"""Controlled vocabulary entry for interests taxonomy."""

	id: UUID
	slug: str
	name: str
	parent_id: Optional[UUID]
	created_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "Interest":
		return cls(
			id=_as_uuid(record["id"]),
			slug=str(record.get("slug", "")),
			name=str(record.get("name", "")),
			parent_id=_as_uuid(record["parent_id"]) if record.get("parent_id") else None,
			created_at=record["created_at"],
		)


@dataclass(slots=True)
class UserInterest:
	"""Interest attached to a user with visibility."""

	user_id: UUID
	interest_id: UUID
	visibility: str
	added_at: datetime
	name: Optional[str] = None
	slug: Optional[str] = None

	@classmethod
	def from_record(cls, record: RecordLike) -> "UserInterest":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			interest_id=_as_uuid(record["interest_id"]),
			visibility=str(record.get("visibility", "everyone")),
			added_at=record["added_at"],
			name=record.get("name"),
			slug=record.get("slug"),
		)


@dataclass(slots=True)
class UserSkill:
	"""Skill entry for a user."""

	user_id: UUID
	name: str
	display: str
	proficiency: int
	visibility: str
	added_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "UserSkill":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			name=str(record.get("name", "")),
			display=str(record.get("display", "")),
			proficiency=int(record.get("proficiency", 1)),
			visibility=str(record.get("visibility", "everyone")),
			added_at=record["added_at"],
		)


@dataclass(slots=True)
class SocialLink:
	"""Social link row for a user."""

	user_id: UUID
	kind: str
	url: str
	visibility: str

	@classmethod
	def from_record(cls, record: RecordLike) -> "SocialLink":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			kind=str(record.get("kind", "")),
			url=str(record.get("url", "")),
			visibility=str(record.get("visibility", "everyone")),
		)


@dataclass(slots=True)
class Education:
	"""Program/year metadata for a user."""

	user_id: UUID
	program: str
	year: Optional[int]
	visibility: str
	updated_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "Education":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			program=str(record.get("program", "")),
			year=int(record["year"]) if record.get("year") is not None else None,
			visibility=str(record.get("visibility", "everyone")),
			updated_at=record["updated_at"],
		)


@dataclass(slots=True)
class PublicProfile:
	"""Denormalised public profile projection."""

	user_id: UUID
	handle: str
	display_name: str
	avatar_key: Optional[str]
	campus_id: Optional[UUID]
	bio: str
	program: str
	year: Optional[int]
	interests: list[str]
	skills: list[dict[str, object]]
	links: list[dict[str, object]]
	updated_at: datetime

	@classmethod
	def from_record(cls, record: RecordLike) -> "PublicProfile":
		return cls(
			user_id=_as_uuid(record["user_id"]),
			handle=str(record.get("handle", "")),
			display_name=str(record.get("display_name", "")),
			avatar_key=record.get("avatar_key"),
			campus_id=_as_uuid(record["campus_id"]) if record.get("campus_id") else None,
			bio=str(record.get("bio", "")),
			program=str(record.get("program", "")),
			year=int(record["year"]) if record.get("year") is not None else None,
			interests=list(record.get("interests") or []),
			skills=list(record.get("skills") or []),
			links=list(record.get("links") or []),
			updated_at=record["updated_at"],
		)
