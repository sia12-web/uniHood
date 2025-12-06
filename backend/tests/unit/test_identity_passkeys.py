import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.domain.identity import models, schemas, webauthn
from app.domain.identity import devices as device_module
from app.domain.identity import sessions as sessions_module


def make_user() -> models.User:
    now = datetime.now(timezone.utc)
    return models.User(
        id=uuid4(),
        email="user@example.com",
        email_verified=True,
        handle="testuser",
        display_name="Test User",
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
async def test_register_options_stores_challenge(fake_redis, monkeypatch):
    user = make_user()

    async def fake_list_credentials(user_id: str):
        assert user_id == str(user.id)
        return [b"cred-id"]

    monkeypatch.setattr(device_module, "list_passkey_credentials", fake_list_credentials)

    result = await webauthn.register_options(user, schemas.PasskeyRegisterOptionsRequest(label="Laptop"))

    assert "publicKey" in result
    public_key = result["publicKey"]
    assert public_key["authenticatorSelection"]["residentKey"] == "preferred"
    stored = await fake_redis.get(f"webauthn:reg:{user.id}")
    assert stored is not None
    payload = json.loads(stored)
    assert payload["label"] == "Laptop"
    # Exclude credentials should include the existing credential id
    assert len(public_key["excludeCredentials"]) == 1


@pytest.mark.asyncio
async def test_register_verify_persists_device(fake_redis, monkeypatch):
    user = make_user()
    challenge = "challenge-token"
    await fake_redis.set(
        f"webauthn:reg:{user.id}",
        json.dumps({"challenge": challenge, "label": "Phone", "user_id": str(user.id)}),
        ex=300,
    )

    created_devices = {}

    async def fake_create_passkey(user_id: str, **kwargs):
        created_devices.update({"user_id": user_id, **kwargs})
        return schemas.PasskeyDevice(
            id=uuid4(),
            label=kwargs["label"],
            aaguid=None,
            transports=list(kwargs["transports"]),
            created_at=datetime.now(timezone.utc),
            last_used_at=None,
        )

    monkeypatch.setattr(device_module, "create_passkey", fake_create_passkey)

    payload = schemas.PasskeyRegisterVerifyRequest(
        attestationResponse={
            "challenge": challenge,
            "credentialId": "Y3JlZC1uZXc=",
            "publicKey": "cHVibGljLWtleQ==",
            "attestationFormat": "none",
            "transports": ["internal"],
            "counter": 0,
        }
    )

    device = await webauthn.register_verify(user, payload)

    assert device.label == "Phone"
    assert created_devices["label"] == "Phone"
    assert created_devices["user_id"] == str(user.id)
    assert created_devices["attestation_fmt"] == "none"
    assert await fake_redis.get(f"webauthn:reg:{user.id}") is None


@pytest.mark.asyncio
async def test_auth_verify_issues_session(fake_redis, monkeypatch):
    user = make_user()
    challenge = "auth-challenge"
    await fake_redis.set(
        f"webauthn:auth:{challenge}",
        json.dumps({"challenge": challenge, "user_id": str(user.id)}),
        ex=300,
    )

    authenticator = models.Authenticator(
        id=uuid4(),
        user_id=user.id,
        cred_id=b"cred",
        public_key=b"pub",
        aaguid=None,
        transports=["internal"],
        counter=1,
        attestation_fmt="none",
        label="Laptop",
        created_at=datetime.now(timezone.utc),
        last_used_at=None,
    )

    async def fake_fetch(credential_id: bytes):
        assert credential_id == b"cred"
        return authenticator

    recorded_counter = {}

    async def fake_update(authenticator_id, *, counter):
        recorded_counter["value"] = counter

    async def fake_ensure(user_id: str, *, ip, user_agent, label):
        recorded_counter["ensure"] = (user_id, ip, user_agent, label)
        return None

    async def fake_issue_session(user_obj, *, ip, user_agent, device_label, fingerprint=None):
        return schemas.LoginResponse(
            user_id=user_obj.id,
            access_token="access",
            refresh_token="refresh",
            token_type="bearer",
            expires_in=900,
            session_id=uuid4(),
        )

    async def fake_load_user(user_id: str):
        assert user_id == str(user.id)
        return user

    monkeypatch.setattr(device_module, "fetch_passkey_by_credential", fake_fetch)
    monkeypatch.setattr(device_module, "update_passkey_usage", fake_update)
    monkeypatch.setattr(device_module, "ensure_trusted_device", fake_ensure)
    monkeypatch.setattr(sessions_module, "issue_session_tokens", fake_issue_session)
    monkeypatch.setattr(webauthn, "_load_user", fake_load_user)

    payload = schemas.PasskeyAuthVerifyRequest(
        assertionResponse={
            "challengeId": challenge,
            "challenge": challenge,
            "credentialId": "Y3JlZA==",
            "newCounter": 2,
        }
    )

    response = await webauthn.auth_verify(payload, ip="203.0.113.1", user_agent="Mozilla/5.0", device_label="Laptop")

    assert response.access_token == "access"
    assert recorded_counter["value"] == 2
    assert await fake_redis.get(f"webauthn:auth:{challenge}") is None
    stored_token = await fake_redis.get(f"auth:reauth:{user.id}")
    assert stored_token is not None
    assert response.reauth_token == stored_token
# *** End File