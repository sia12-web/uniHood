"""Pydantic schemas for identity and profile flows."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, HttpUrl, RootModel

HANDLE_PATTERN = r"^[a-z0-9_-]{3,30}$"


class GalleryImage(BaseModel):
	key: str
	url: HttpUrl
	uploaded_at: Optional[str] = None


class CampusOut(BaseModel):
	id: UUID
	name: str
	domain: Optional[str] = None
	logo_url: Optional[str] = None


class RegisterRequest(BaseModel):
	email: EmailStr
	password: Annotated[str, Field(min_length=8)]
	handle: Optional[Annotated[str, Field(pattern=HANDLE_PATTERN)]] = None
	display_name: Annotated[str, Field(default="", max_length=80)]
	campus_id: Optional[UUID] = None


class RegisterResponse(BaseModel):
	user_id: UUID
	email: EmailStr


class LoginRequest(BaseModel):
	email: EmailStr
	password: str
	device_label: Optional[Annotated[str, Field(max_length=100)]] = None


class TokenPair(BaseModel):
	access_token: str = ""
	refresh_token: str = ""
	token_type: Literal["bearer"] = "bearer"
	expires_in: int = 900


class LoginResponse(TokenPair):
	user_id: UUID
	twofa_required: bool = False
	challenge_id: Optional[str] = None
	session_id: Optional[UUID] = None
	reauth_token: Optional[str] = None
	step_up_required: bool = False
	risk_score: Optional[int] = None
	request_id: Optional[str] = None


class RefreshRequest(BaseModel):
	session_id: UUID
	device_label: Optional[Annotated[str, Field(max_length=100)]] = None


class LogoutRequest(BaseModel):
	user_id: UUID
	session_id: UUID


class VerifyRequest(BaseModel):
	token: str


class ResendRequest(BaseModel):
	email: EmailStr


class PrivacySettings(BaseModel):
	visibility: Literal["everyone", "friends", "none"] = "everyone"
	ghost_mode: bool = False
	discoverable_by_email: bool = True
	show_online_status: bool = True
	share_activity: bool = True


class PrivacySettingsPatch(BaseModel):
	visibility: Optional[Literal["everyone", "friends", "none"]] = None
	ghost_mode: Optional[bool] = None
	discoverable_by_email: Optional[bool] = None
	show_online_status: Optional[bool] = None
	share_activity: Optional[bool] = None


class StatusSettings(BaseModel):
	text: Annotated[str, Field(default="", max_length=120)] = ""
	emoji: Annotated[str, Field(default="", max_length=4)] = ""
	updated_at: Optional[str] = None
	banner_url: Optional[str] = None


class SocialLinks(BaseModel):
	instagram: Optional[Annotated[str, Field(max_length=100)]] = None
	linkedin: Optional[Annotated[str, Field(max_length=100)]] = None
	twitter: Optional[Annotated[str, Field(max_length=100)]] = None
	tiktok: Optional[Annotated[str, Field(max_length=100)]] = None
	website: Optional[Annotated[str, Field(max_length=200)]] = None


class ProfileOut(BaseModel):
	id: UUID
	email: Optional[EmailStr] = None
	email_verified: bool
	handle: str
	display_name: str
	bio: Annotated[str, Field(max_length=500)] = ""
	avatar_url: Optional[HttpUrl] = None
	avatar_key: Optional[str] = None
	campus_id: Optional[UUID] = None
	privacy: PrivacySettings
	status: StatusSettings
	major: Optional[Annotated[str, Field(max_length=80)]] = None
	graduation_year: Optional[Annotated[int, Field(ge=1900, le=2100)]] = None
	passions: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list)
	courses: list[Course] = Field(default_factory=list)
	gallery: list[GalleryImage] = Field(default_factory=list)
	social_links: SocialLinks = Field(default_factory=SocialLinks)
	lat: Optional[float] = None
	lon: Optional[float] = None
	ten_year_vision: Optional[Annotated[str, Field(max_length=500)]] = None
	# XP System
	xp: int = 0
	level: int = 1
	level_label: str = "Newcomer"
	next_level_xp: Optional[int] = None


class ProfilePatch(BaseModel):
	display_name: Optional[Annotated[str, Field(max_length=80)]] = None
	bio: Optional[Annotated[str, Field(max_length=500)]] = None
	privacy: Optional[PrivacySettings] = None
	status: Optional[StatusSettings] = None
	handle: Optional[Annotated[str, Field(pattern=HANDLE_PATTERN)]] = None
	major: Optional[Annotated[str, Field(max_length=80)]] = None
	graduation_year: Optional[Annotated[int, Field(ge=1900, le=2100)]] = None
	passions: Optional[list[Annotated[str, Field(max_length=40)]]] = None
	courses: Optional[list[Annotated[str, Field(max_length=40)]]] = None
	social_links: Optional[SocialLinks] = None
	lat: Optional[float] = None
	lon: Optional[float] = None
	campus_id: Optional[UUID] = None
	ten_year_vision: Optional[Annotated[str, Field(max_length=500)]] = None


class PresignRequest(BaseModel):
	mime: str
	bytes: Annotated[int, Field(gt=0)]


class PresignResponse(BaseModel):
	key: str
	url: HttpUrl
	expires_s: int


class LocalUploadResponse(BaseModel):
	"""Response for local file uploads in development."""
	key: str
	url: str


class AvatarCommitRequest(BaseModel):
	key: str


class GalleryCommitRequest(BaseModel):
	key: str


class GalleryRemoveRequest(BaseModel):
	key: str


class VerificationStatus(BaseModel):
	verified: bool
	user_id: UUID
	access_token: Optional[str] = None
	refresh_token: Optional[str] = None
	expires_in: Optional[int] = None
	session_id: Optional[UUID] = None


class HandleAvailability(RootModel[dict]):
	root: dict[str, bool]


class SessionRow(BaseModel):
	id: UUID
	created_at: datetime
	last_used_at: datetime
	ip: Optional[str] = None
	user_agent: Optional[str] = None
	device_label: str
	revoked: bool
	risk_score: Optional[int] = None
	risk_reasons: list[str] = Field(default_factory=list)
	step_up_required: bool = False


class SessionLabelRequest(BaseModel):
	session_id: UUID
	device_label: Annotated[str, Field(max_length=100)]


class SessionRevokeRequest(BaseModel):
	session_id: UUID


class PasskeyRegisterOptionsRequest(BaseModel):
	platform: Optional[Literal["auto", "cross-platform"]] = None
	label: Optional[Annotated[str, Field(max_length=40)]] = None


class PasskeyRegisterVerifyRequest(BaseModel):
	attestation_response: Dict[str, Any] = Field(alias="attestationResponse")

	model_config = {"populate_by_name": True}


class PasskeyAuthOptionsRequest(BaseModel):
	username_or_email: Optional[str] = Field(default=None, alias="usernameOrEmail")

	model_config = {"populate_by_name": True}


class PasskeyAuthVerifyRequest(BaseModel):
	assertion_response: Dict[str, Any] = Field(alias="assertionResponse")

	model_config = {"populate_by_name": True}


class PasskeyLabelRequest(BaseModel):
	label: Annotated[str, Field(max_length=40)]


class PasskeyRemoveRequest(BaseModel):
	reauth_token: Optional[str] = Field(default=None, alias="reauthToken")

	model_config = {"populate_by_name": True}


class PasskeyDevice(BaseModel):
	id: UUID
	label: str
	aaguid: Optional[UUID] = None
	transports: list[str]
	created_at: datetime
	last_used_at: Optional[datetime] = None


class TrustedDevice(BaseModel):
	id: UUID
	label: str
	platform: str
	browser: str
	last_ip: Optional[str] = None
	first_seen: datetime
	last_seen: datetime
	revoked: bool


class TrustedDeviceLabelRequest(BaseModel):
	device_id: UUID = Field(alias="deviceId")
	label: Annotated[str, Field(max_length=40)]

	model_config = {"populate_by_name": True}


class TrustedDeviceRevokeRequest(BaseModel):
	device_id: UUID = Field(alias="deviceId")
	reauth_token: Optional[str] = Field(default=None, alias="reauthToken")

	model_config = {"populate_by_name": True}


class TrustedDeviceRevokeAllRequest(BaseModel):
	reauth_token: Optional[str] = Field(default=None, alias="reauthToken")

	model_config = {"populate_by_name": True}


class LinkedAccountOut(BaseModel):
	id: UUID
	provider: Literal["google", "microsoft", "apple"]
	subject: str
	email: Optional[EmailStr] = None
	created_at: datetime


class LinkStartResponse(BaseModel):
	authorize_url: HttpUrl = Field(alias="authorizeUrl")
	state: str
	code_verifier: str = Field(alias="codeVerifier")
	code_challenge: str = Field(alias="codeChallenge")

	model_config = {"populate_by_name": True}


class EmailChangeRequestPayload(BaseModel):
	new_email: EmailStr = Field(alias="newEmail")

	model_config = {"populate_by_name": True}


class EmailChangeConfirmPayload(BaseModel):
	token: Annotated[str, Field(min_length=8, max_length=200)]


class PhoneNumberRequest(BaseModel):
	e164: Annotated[str, Field(pattern=r"^\+[1-9]\d{7,14}$")]


class PhoneNumberVerify(BaseModel):
	code: Annotated[str, Field(min_length=4, max_length=6)]


class PhoneNumberOut(BaseModel):
	e164: str
	verified: bool
	verified_at: Optional[datetime] = None


class ContactSaltResponse(BaseModel):
	salt: str
	rotates_at: datetime


class ContactOptInRequest(BaseModel):
	enabled: bool


class ContactOptInResponse(BaseModel):
	enabled: bool
	updated_at: datetime


class ContactHashUpload(BaseModel):
	hashes: list[Annotated[str, Field(min_length=32, max_length=128)]]


class ContactHashMatch(BaseModel):
	hashes: list[Annotated[str, Field(min_length=32, max_length=128)]]


class ContactMatchResult(BaseModel):
	handles: list[str] = Field(default_factory=list)


class BlockListEntry(BaseModel):
	blocked_id: UUID
	blocked_handle: Optional[str] = None
	blocked_display_name: Optional[str] = None
	created_at: datetime


class NotificationPreferences(BaseModel):
	invites: bool = True
	friends: bool = True
	chat: bool = True
	rooms: bool = True
	activities: bool = True


class NotificationPreferencesPatch(BaseModel):
	invites: Optional[bool] = None
	friends: Optional[bool] = None
	chat: Optional[bool] = None
	rooms: Optional[bool] = None
	activities: Optional[bool] = None


class ExportRequest(BaseModel):
	pass


class ExportStatus(BaseModel):
	status: Literal["pending", "ready", "expired"]
	requested_at: datetime
	completed_at: Optional[datetime] = None
	download_url: Optional[HttpUrl] = None


class DeletionRequest(BaseModel):
	pass


class DeletionConfirm(BaseModel):
	token: Annotated[str, Field(min_length=16, max_length=128)]


class DeletionStatus(BaseModel):
	requested_at: datetime
	confirmed_at: Optional[datetime] = None
	purged_at: Optional[datetime] = None


class AuditLogItem(BaseModel):
	id: int
	event: str
	meta: dict[str, str]
	created_at: datetime


class PermissionOut(BaseModel):
	id: UUID
	action: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	description: str = ""


class RoleOut(BaseModel):
	id: UUID
	name: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	description: str = ""
	created_at: datetime
	permissions: list[PermissionOut] = []


class RoleCreateRequest(BaseModel):
	name: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	description: Annotated[str, Field(max_length=200)] | None = ""


class RolePermissionRequest(BaseModel):
	permission_id: UUID


class RolePermissionPathParams(BaseModel):
	role_id: UUID
	permission_id: UUID


class UserRoleGrantRequest(BaseModel):
	role_id: UUID
	campus_id: Optional[UUID] = None


class UserRoleRevokeRequest(BaseModel):
	role_id: UUID
	campus_id: Optional[UUID] = None


class UserRoleOut(BaseModel):
	role_id: UUID
	role_name: str
	campus_id: Optional[UUID] = None
	granted_by: Optional[UUID] = None
	created_at: datetime


FlagKind = Literal["bool", "percentage", "allowlist", "experiment"]


class FeatureFlagPayload(BaseModel):
	model_config = {"extra": "allow"}


class FeatureFlagUpsertRequest(BaseModel):
	key: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	kind: FlagKind
	description: Annotated[str, Field(max_length=200)] = ""
	payload: Dict[str, Any] = Field(default_factory=dict)


class FeatureFlagOut(BaseModel):
	key: str
	kind: FlagKind
	description: str = ""
	payload: Dict[str, Any] = Field(default_factory=dict)


class FlagOverrideRequest(BaseModel):
	key: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	value: Dict[str, Any]
	user_id: Optional[UUID] = None
	campus_id: Optional[UUID] = None


class FlagOverrideDeleteRequest(BaseModel):
	key: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	user_id: Optional[UUID] = None
	campus_id: Optional[UUID] = None


class FlagOverrideOut(BaseModel):
	key: str
	user_id: Optional[UUID] = None
	campus_id: Optional[UUID] = None
	value: Dict[str, Any] = Field(default_factory=dict)
	created_at: datetime


class FlagEvaluationResult(BaseModel):
	enabled: bool | None = None
	variant: Optional[str] = None
	meta: Dict[str, Any] = Field(default_factory=dict)


class PolicyDocumentOut(BaseModel):
	slug: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	version: Annotated[str, Field(min_length=1, max_length=50)]
	title: str
	content_md: str
	required: bool = True
	created_at: datetime


class PolicySummary(BaseModel):
	slug: str
	version: str
	required: bool
	title: str


class ConsentRecordOut(BaseModel):
	policy_slug: str
	version: str
	accepted: bool
	accepted_at: datetime
	meta: Dict[str, Any] = Field(default_factory=dict)


class ConsentAcceptRequest(BaseModel):
	slug: Annotated[str, Field(pattern=r"^[a-z0-9.\-]{3,64}$")]
	version: Annotated[str, Field(min_length=1, max_length=50)]
	accepted: bool
	meta: Dict[str, Any] | None = None


class ConsentGateResponse(BaseModel):
	missing: list[PolicySummary]


class AuditLogPage(BaseModel):
	items: list[AuditLogItem]
	cursor: Optional[int] = None


class TwoFAEnrollResponse(BaseModel):
	secret: str
	otpauth_uri: str
	qr_data_url: str


class TwoFAStatus(BaseModel):
	enabled: bool
	created_at: Optional[datetime] = None
	last_verified_at: Optional[datetime] = None


class TwoFAEnableRequest(BaseModel):
	code: Annotated[str, Field(min_length=6, max_length=6)]


class TwoFAVerifyRequest(BaseModel):
	challenge_id: str
	code: Optional[Annotated[str, Field(min_length=6, max_length=6)]] = None
	recovery_code: Optional[Annotated[str, Field(min_length=6, max_length=16)]] = None


class TwoFADisableRequest(BaseModel):
	code: Optional[Annotated[str, Field(min_length=6, max_length=6)]] = None
	recovery_code: Optional[Annotated[str, Field(min_length=6, max_length=16)]] = None


class RecoveryCodesResponse(BaseModel):
	codes: list[str]


class PasswordResetRequest(BaseModel):
	email: EmailStr


class PasswordResetConsume(BaseModel):
	token: str
	new_password: Annotated[str, Field(min_length=8)]


class ForgotPasswordRequest(BaseModel):
	email: EmailStr





VerificationMethod = Literal["sso", "doc"]
VerificationState = Literal["pending", "approved", "rejected", "expired"]


class VerificationEvidence(BaseModel):
	provider: Optional[str] = None
	email: Optional[EmailStr] = None
	s3_key: Optional[str] = None
	mime: Optional[str] = None
	extra: dict[str, str] = Field(default_factory=dict)

	def to_payload(self) -> dict[str, object]:
		payload: dict[str, object] = {"extra": self.extra}
		if self.provider:
			payload["provider"] = self.provider
		if self.email:
			payload["email"] = self.email
		if self.s3_key:
			payload["s3_key"] = self.s3_key
		if self.mime:
			payload["mime"] = self.mime
		return payload


class VerificationEntry(BaseModel):
	id: UUID
	user_id: UUID
	method: VerificationMethod
	state: VerificationState
	evidence: dict[str, object] = Field(default_factory=dict)
	reason: Optional[str] = None
	expires_at: Optional[datetime] = None
	created_at: datetime
	decided_at: Optional[datetime] = None


class TrustProfileOut(BaseModel):
	trust_level: int
	badge: Optional[str] = None
	verified_at: Optional[datetime] = None
	expires_at: Optional[datetime] = None


class VerificationSsoCompleteRequest(BaseModel):
	state: Annotated[str, Field(min_length=8, max_length=256)]
	id_token: Annotated[str, Field(min_length=3)]


class VerificationSsoStartResponse(BaseModel):
	authorize_url: Annotated[str, Field(min_length=1)]
	state: Annotated[str, Field(min_length=8, max_length=256)]
	code_verifier: Annotated[str, Field(min_length=8, max_length=256)]
	code_challenge: Annotated[str, Field(min_length=8, max_length=256)]


class VerificationStatusResponse(BaseModel):
	trust: TrustProfileOut
	verifications: list[VerificationEntry]


class VerificationDocPresignRequest(BaseModel):
	mime: Annotated[str, Field(min_length=3, max_length=64)]
	bytes: Annotated[int, Field(gt=0)]


class VerificationDocSubmit(BaseModel):
	key: Annotated[str, Field(min_length=8, max_length=512)]
	mime: Optional[str] = None


class UniversityVerificationSendCode(BaseModel):
	email: EmailStr


class UniversityVerificationConfirmCode(BaseModel):
	code: Annotated[str, Field(min_length=6, max_length=6)]


class AdminVerificationDecision(BaseModel):
	approve: bool
	note: Optional[Annotated[str, Field(max_length=500)]] = None


class InterestNode(BaseModel):
	id: UUID
	slug: str
	name: str
	parent_id: Optional[UUID] = None


class MyInterest(BaseModel):
	interest_id: UUID
	slug: str
	name: str
	visibility: Literal["everyone", "friends", "none"]
	added_at: datetime


class InterestAddRequest(BaseModel):
	interest_id: UUID
	visibility: Optional[Literal["everyone", "friends", "none"]] = None


class InterestRemoveRequest(BaseModel):
	interest_id: UUID


class InterestVisibilityPatch(BaseModel):
	interest_id: UUID
	visibility: Literal["everyone", "friends", "none"]


class MySkill(BaseModel):
	name: str
	display: str
	proficiency: Annotated[int, Field(ge=1, le=5)]
	visibility: Literal["everyone", "friends", "none"]
	added_at: datetime


class SkillUpsertRequest(BaseModel):
	name: Annotated[str, Field(min_length=1, max_length=30)]
	display: Annotated[str, Field(min_length=1, max_length=40)]
	proficiency: Annotated[int, Field(ge=1, le=5)]
	visibility: Optional[Literal["everyone", "friends", "none"]] = None


class SkillRemoveRequest(BaseModel):
	name: Annotated[str, Field(min_length=1, max_length=30)]


class SkillVisibilityPatch(BaseModel):
	name: Annotated[str, Field(min_length=1, max_length=30)]
	visibility: Literal["everyone", "friends", "none"]


class MyLink(BaseModel):
	kind: str
	url: HttpUrl
	visibility: Literal["everyone", "friends", "none"]


class LinkUpsertRequest(BaseModel):
	kind: Annotated[str, Field(min_length=3, max_length=32)]
	url: HttpUrl
	visibility: Optional[Literal["everyone", "friends", "none"]] = None


class LinkRemoveRequest(BaseModel):
	kind: Annotated[str, Field(min_length=3, max_length=32)]


class LinkVisibilityPatch(BaseModel):
	kind: Annotated[str, Field(min_length=3, max_length=32)]
	visibility: Literal["everyone", "friends", "none"]


class EducationOut(BaseModel):
	program: str = ""
	year: Optional[int] = None
	visibility: Literal["everyone", "friends", "none"] = "everyone"
	updated_at: datetime


class EducationPatch(BaseModel):
	program: Optional[Annotated[str, Field(max_length=80)]] = None
	year: Optional[Annotated[int, Field(ge=1, le=10)]] = None
	visibility: Optional[Literal["everyone", "friends", "none"]] = None


class PublicSkill(BaseModel):
	display: str
	proficiency: Annotated[int, Field(ge=1, le=5)]


class PublicLink(BaseModel):
	kind: str
	url: HttpUrl


class PublicProfileOut(BaseModel):
	user_id: UUID
	handle: str
	display_name: str
	avatar_url: Optional[HttpUrl] = None
	campus_id: Optional[UUID] = None
	bio: str = ""
	program: Optional[str] = None
	year: Optional[int] = None
	interests: list[str]
	skills: list[PublicSkill]
	links: list[PublicLink]
	gallery: list[GalleryImage] = Field(default_factory=list)
	# XP
	xp: int = 0
	level: int = 1
	level_label: str = "Newcomer"
	next_level_xp: Optional[int] = None


class MatchPerson(BaseModel):
	user_id: UUID
	handle: str
	display_name: str
	avatar_url: Optional[HttpUrl] = None
	campus_id: Optional[UUID] = None
	score: float
	interests: list[str] = Field(default_factory=list)
	skills: list[PublicSkill] = Field(default_factory=list)


class Course(BaseModel):
	code: str
	name: Optional[str] = None


class UserCourse(BaseModel):
	code: str
	visibility: Literal["everyone", "friends", "none"] = "everyone"
	created_at: Optional[datetime] = None


class CourseBulkSetRequest(BaseModel):
	codes: List[str]
	visibility: Literal["everyone", "friends", "none"] = "everyone"
