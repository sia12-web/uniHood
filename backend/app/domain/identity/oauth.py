"""Lightweight SSO helpers for Google/Microsoft OAuth flows."""

from __future__ import annotations

import base64
import json
import secrets
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from app.domain.identity import policy
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.settings import settings

STATE_TTL_SECONDS = 600


@dataclass(slots=True)
class OAuthStartPayload:
	authorize_url: str
	state: str
	code_verifier: str
	code_challenge: str


@dataclass(slots=True)
class OAuthResult:
	provider: str
	email: str
	email_verified: bool
	user_id: str
	campus_id: str


def _provider_config(provider: str) -> Dict[str, str]:
	provider = provider.lower()
	if provider == "google":
		return {
			"authorize": "https://accounts.google.com/o/oauth2/v2/auth",
			"client_id": settings.oauth_google_client_id or "demo-google-client-id",
			"scope": "openid email profile",
		}
	if provider == "microsoft":
		return {
			"authorize": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			"client_id": settings.oauth_microsoft_client_id or "demo-microsoft-client-id",
			"scope": "openid email profile",
		}
	raise policy.IdentityPolicyError("verify_provider_unsupported")


def _pad_b64(value: str) -> str:
	return value + "=" * ((4 - len(value) % 4) % 4)


def _decode_id_token(id_token: str) -> Dict[str, Any]:
	try:
		return json.loads(id_token)
	except json.JSONDecodeError:
		pass

	try:
		decoded = base64.urlsafe_b64decode(_pad_b64(id_token)).decode()
		return json.loads(decoded)
	except Exception:
		return {"email": id_token, "email_verified": True}


async def start(provider: str, user: AuthenticatedUser, *, redirect_uri: Optional[str] = None) -> OAuthStartPayload:
	await policy.enforce_verify_sso_rate(user.id)
	config = _provider_config(provider)
	state = secrets.token_urlsafe(16)
	code_verifier = secrets.token_urlsafe(32)
	code_challenge = code_verifier  # simplified PKCE for scaffold
	callback_url = redirect_uri or settings.oauth_redirect_base or "https://app.divan.local/verify/sso/callback"
	params = {
		"client_id": config["client_id"],
		"response_type": "code",
		"scope": config["scope"],
		"redirect_uri": callback_url,
		"state": state,
		"code_challenge": code_challenge,
		"code_challenge_method": "plain",
	}
	authorize_url = f"{config['authorize']}?{urlencode(params)}"
	await redis_client.set(
		f"verify:sso:state:{state}",
		json.dumps({
			"user_id": user.id,
			"campus_id": user.campus_id,
			"provider": provider.lower(),
			"code_verifier": code_verifier,
		}),
		ex=STATE_TTL_SECONDS,
	)
	return OAuthStartPayload(authorize_url=authorize_url, state=state, code_verifier=code_verifier, code_challenge=code_challenge)


async def complete(provider: str, state: str, id_token: str) -> OAuthResult:
	key = f"verify:sso:state:{state}"
	data = await redis_client.get(key)
	if not data:
		raise policy.IdentityPolicyError("verify_state_invalid")
	await redis_client.delete(key)
	stored = json.loads(data)
	if stored.get("provider") != provider.lower():
		raise policy.IdentityPolicyError("verify_provider_mismatch")
	claims = _decode_id_token(id_token)
	email = str(claims.get("email", "")).strip().lower()
	if not email:
		raise policy.IdentityPolicyError("verify_email_missing")
	email_verified = bool(claims.get("email_verified", True))
	return OAuthResult(
		provider=provider.lower(),
		email=email,
		email_verified=email_verified,
		user_id=stored["user_id"],
		campus_id=stored["campus_id"],
	)
