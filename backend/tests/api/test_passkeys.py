import uuid
from datetime import datetime, timezone

import pytest

from app.api import passkeys as passkeys_api
from app.domain.identity import models, schemas


def _make_user(user_id: uuid.UUID | None = None) -> models.User:
	identifier = user_id or uuid.uuid4()
	now = datetime.now(timezone.utc)
	return models.User(
		id=identifier,
		email="user@example.com",
		email_verified=True,
		handle="demo",
		display_name="Demo User",
		bio="",
		avatar_key=None,
		avatar_url=None,
		campus_id=None,
		privacy={},
		status={},
		password_hash="hash",
		created_at=now,
		updated_at=now,
	)


@pytest.mark.asyncio
async def test_passkey_registration_endpoints(api_client, monkeypatch):
	user_id = uuid.uuid4()
	campus_id = uuid.uuid4()
	user = _make_user(user_id)

	async def fake_load_user(auth_user):
		assert auth_user.id == str(user_id)
		return user

	async def fake_register_options(user_obj, request):
		assert user_obj.id == user_id
		assert isinstance(request, schemas.PasskeyRegisterOptionsRequest)
		return {"publicKey": {"challenge": "abc", "timeout": 30000}}

	device_response = schemas.PasskeyDevice(
		id=uuid.uuid4(),
		label="Laptop",
		aaguid=None,
		transports=["internal"],
		created_at=datetime.now(timezone.utc),
		last_used_at=None,
	)

	async def fake_register_verify(user_obj, payload):
		assert user_obj.id == user_id
		assert payload.attestation_response["challenge"] == "abc"
		return device_response

	monkeypatch.setattr(passkeys_api, "_load_user", fake_load_user)
	monkeypatch.setattr(passkeys_api.webauthn, "register_options", fake_register_options)
	monkeypatch.setattr(passkeys_api.webauthn, "register_verify", fake_register_verify)

	opts = await api_client.post(
		"/passkeys/register/options",
		json={"label": "Laptop"},
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert opts.status_code == 200
	assert opts.json()["publicKey"]["challenge"] == "abc"

	verify = await api_client.post(
		"/passkeys/register/verify",
		json={"attestationResponse": {"challenge": "abc"}},
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert verify.status_code == 200
	body = verify.json()
	assert body["label"] == "Laptop"
	assert body["id"] == str(device_response.id)


@pytest.mark.asyncio
async def test_passkey_auth_flow_returns_reauth_token(api_client, monkeypatch):
	async def fake_auth_options(request):
		assert request.username_or_email == "user@example.com"
		return {"challengeId": "cid", "publicKey": {"challenge": "abc"}}

	login = schemas.LoginResponse(
		user_id=uuid.uuid4(),
		access_token="access",
		refresh_token="refresh",
		reauth_token="reauth-123",
	)

	async def fake_auth_verify(payload, *, ip, user_agent, device_label):
		assert payload.assertion_response["challengeId"] == "cid"
		return login

	monkeypatch.setattr(passkeys_api.webauthn, "auth_options", fake_auth_options)
	monkeypatch.setattr(passkeys_api.webauthn, "auth_verify", fake_auth_verify)

	opts = await api_client.post(
		"/passkeys/auth/options",
		json={"usernameOrEmail": "user@example.com"},
	)
	assert opts.status_code == 200
	assert opts.json()["challengeId"] == "cid"

	verify = await api_client.post(
		"/passkeys/auth/verify",
		json={"assertionResponse": {"challengeId": "cid", "challenge": "abc"}},
		headers={"User-Agent": "Mozilla/5.0", "X-Device-Label": "Browser"},
	)
	assert verify.status_code == 200
	payload = verify.json()
	assert payload["reauth_token"] == "reauth-123"


@pytest.mark.asyncio
async def test_trusted_device_management_endpoints(api_client, monkeypatch):
	user_id = uuid.uuid4()
	campus_id = uuid.uuid4()
	user = _make_user(user_id)
	now = datetime.now(timezone.utc)
	device = schemas.TrustedDevice(
		id=uuid.uuid4(),
		label="Chrome",
		platform="mac",
		browser="chrome",
		last_ip="203.0.113.1",
		first_seen=now,
		last_seen=now,
		revoked=False,
	)

	async def fake_load_user(auth_user):
		assert auth_user.id == str(user_id)
		return user

	async def fake_list_trusted(user_value):
		assert user_value == str(user_id)
		return [device]

	actions = {}

	async def fake_set_label(user_value, device_id, label):
		actions["label"] = (user_value, device_id, label)

	async def fake_revoke_device(user_value, device_id):
		actions.setdefault("revoke", []).append((user_value, device_id))

	async def fake_revoke_all(user_value):
		actions.setdefault("revoke_all", []).append(user_value)

	async def fake_verify_recent(user_value, token):
		actions.setdefault("reauth", []).append((user_value, token))

	monkeypatch.setattr(passkeys_api, "_load_user", fake_load_user)
	monkeypatch.setattr(passkeys_api.devices, "list_trusted_devices", fake_list_trusted)
	monkeypatch.setattr(passkeys_api.devices, "set_trusted_device_label", fake_set_label)
	monkeypatch.setattr(passkeys_api.devices, "revoke_trusted_device", fake_revoke_device)
	monkeypatch.setattr(passkeys_api.devices, "revoke_all_trusted_devices", fake_revoke_all)
	monkeypatch.setattr(passkeys_api.policy, "verify_recent_reauth", fake_verify_recent)

	listing = await api_client.get(
		"/passkeys/devices/mine",
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert listing.status_code == 200
	items = listing.json()
	assert items[0]["label"] == "Chrome"

	label_resp = await api_client.post(
		"/passkeys/devices/label",
		json={"deviceId": str(device.id), "label": "Work Browser"},
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert label_resp.status_code == 200, label_resp.text
	assert actions["label"] == (str(user_id), device.id, "Work Browser")

	revoke_resp = await api_client.post(
		"/passkeys/devices/revoke",
		json={"deviceId": str(device.id), "reauthToken": "token-123"},
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert revoke_resp.status_code == 200, revoke_resp.text
	assert actions["reauth"][-1] == (str(user_id), "token-123")
	assert actions["revoke"][0] == (str(user_id), device.id)

	revoke_all_resp = await api_client.post(
		"/passkeys/devices/revoke_all",
		json={"reauthToken": "token-456"},
		headers={"X-User-Id": str(user_id), "X-Campus-Id": str(campus_id)},
	)
	assert revoke_all_resp.status_code == 200, revoke_all_resp.text
	assert actions["reauth"][-1] == (str(user_id), "token-456")
	assert actions["revoke_all"][0] == str(user_id)
