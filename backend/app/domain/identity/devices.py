"""Device management helpers for passkeys and trusted sessions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional
from uuid import UUID, uuid4

from asyncpg.exceptions import UniqueViolationError

from app.domain.identity import attest, audit, models, policy, schemas
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _authenticator_to_schema(record: models.Authenticator) -> schemas.PasskeyDevice:
    return schemas.PasskeyDevice(
        id=record.id,
        label=record.label,
        aaguid=record.aaguid,
        transports=record.transports,
        created_at=record.created_at,
        last_used_at=record.last_used_at,
    )


async def list_passkeys(user_id: str) -> list[schemas.PasskeyDevice]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM authenticators
            WHERE user_id = $1
            ORDER BY created_at ASC
            """,
            user_id,
        )
    devices = [models.Authenticator.from_record(row) for row in rows]
    return [_authenticator_to_schema(device) for device in devices]


async def list_passkey_credentials(user_id: str) -> list[bytes]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT cred_id FROM authenticators WHERE user_id = $1", user_id)
    return [bytes(row["cred_id"]) for row in rows]


async def count_passkeys(user_id: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM authenticators WHERE user_id = $1", user_id)
    return int(count or 0)


async def create_passkey(
    user_id: str,
    *,
    credential_id: bytes,
    public_key: bytes,
    aaguid: str | UUID | None,
    transports: Iterable[str],
    attestation_fmt: Optional[str],
    counter: int,
    label: str,
) -> schemas.PasskeyDevice:
    safe_label = attest.sanitize_label(label)
    clean_transports = attest.normalize_transports(transports)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchval("SELECT COUNT(*) FROM authenticators WHERE user_id = $1", user_id)
            policy.guard_passkey_limit(int(current or 0))
            aaguid_value = UUID(str(aaguid)) if aaguid else None
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO authenticators (
                        id,
                        user_id,
                        cred_id,
                        public_key,
                        aaguid,
                        transports,
                        counter,
                        attestation_fmt,
                        label
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                    """,
                    uuid4(),
                    user_id,
                    credential_id,
                    public_key,
                    aaguid_value,
                        clean_transports,
                    counter,
                    attestation_fmt,
                        safe_label,
                )
            except UniqueViolationError as exc:
                raise policy.IdentityPolicyError("passkey_exists") from exc
    device = models.Authenticator.from_record(row)
    obs_metrics.inc_passkey_device("add")
    await audit.log_event(
        "passkey_registered",
        user_id=user_id,
        meta={"authenticator_id": str(device.id), "fmt": attestation_fmt or "none"},
    )
    return _authenticator_to_schema(device)


async def fetch_passkey_by_credential(credential_id: bytes) -> Optional[models.Authenticator]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM authenticators WHERE cred_id = $1", credential_id)
    return models.Authenticator.from_record(row) if row else None


async def update_passkey_usage(authenticator_id: UUID, *, counter: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE authenticators
            SET counter = $2,
                last_used_at = NOW()
            WHERE id = $1
            """,
            authenticator_id,
            counter,
        )


async def set_passkey_label(user_id: str, authenticator_id: UUID, label: str) -> None:
    policy.guard_device_label(label)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE authenticators
            SET label = $3
            WHERE user_id = $1 AND id = $2
            """,
            user_id,
            authenticator_id,
            label,
        )
    if result.endswith("0"):
        raise policy.IdentityPolicyError("passkey_not_found")
    obs_metrics.inc_passkey_device("label")
    await audit.log_event(
        "passkey_labeled",
        user_id=user_id,
        meta={"authenticator_id": str(authenticator_id)},
    )


async def remove_passkey(user_id: str, authenticator_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM authenticators WHERE user_id = $1 AND id = $2",
            user_id,
            authenticator_id,
        )
    if result.endswith("0"):
        raise policy.IdentityPolicyError("passkey_not_found")
    obs_metrics.inc_passkey_device("remove")
    await audit.log_event(
        "passkey_removed",
        user_id=user_id,
        meta={"authenticator_id": str(authenticator_id)},
    )


def _detect_platform(user_agent: Optional[str]) -> str:
    if not user_agent:
        return "unknown"
    ua = user_agent.lower()
    if "iphone" in ua or "ipad" in ua or "ios" in ua:
        return "ios"
    if "android" in ua:
        return "android"
    if "mac os x" in ua or "macintosh" in ua:
        return "mac"
    if "windows" in ua:
        return "windows"
    if "cros" in ua or "chrome os" in ua:
        return "chromeos"
    if "linux" in ua:
        return "linux"
    return "unknown"


def _detect_browser(user_agent: Optional[str]) -> str:
    if not user_agent:
        return "unknown"
    ua = user_agent.lower()
    if "safari" in ua and "chrome" not in ua:
        return "safari"
    if "chrome" in ua and "edg" not in ua:
        return "chrome"
    if "edg" in ua:
        return "edge"
    if "firefox" in ua:
        return "firefox"
    return "unknown"


async def ensure_trusted_device(
    user_id: str,
    *,
    ip: Optional[str],
    user_agent: Optional[str],
    label: str = "",
) -> schemas.TrustedDevice | None:
    if not user_agent and not ip:
        return None
    clean_label = policy.normalise_device_label(label)
    policy.guard_device_label(clean_label)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT *
            FROM trusted_devices
            WHERE user_id = $1 AND user_agent = $2 AND revoked = FALSE
            ORDER BY last_seen DESC
            LIMIT 1
            """,
            user_id,
            user_agent or "",
        )
        now = _now()
        if row:
            await conn.execute(
                """
                UPDATE trusted_devices
                SET last_seen = $3,
                    last_ip = COALESCE($4, last_ip)
                WHERE id = $1
                """,
                row["id"],
                now,
                ip,
            )
            device = models.TrustedDevice.from_record({**row, "last_seen": now, "last_ip": ip or row.get("last_ip")})
            obs_metrics.inc_passkey_device("trusted_seen")
        else:
            device_id = uuid4()
            platform = _detect_platform(user_agent)
            browser = _detect_browser(user_agent)
            await conn.execute(
                """
                INSERT INTO trusted_devices (
                    id,
                    user_id,
                    platform,
                    browser,
                    user_agent,
                    last_ip,
                    first_seen,
                    last_seen,
                    label,
                    revoked
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, FALSE)
                """,
                device_id,
                user_id,
                platform,
                browser,
                user_agent or "",
                ip,
                clean_label,
            )
            row = await conn.fetchrow("SELECT * FROM trusted_devices WHERE id = $1", device_id)
            device = models.TrustedDevice.from_record(row)
            obs_metrics.inc_passkey_device("trusted_add")
    await audit.log_event(
        "trusted_device_seen",
        user_id=user_id,
        meta={
            "device_id": str(device.id),
            "platform": device.platform,
            "browser": device.browser,
        },
    )
    return schemas.TrustedDevice(
        id=device.id,
        label=device.label,
        platform=device.platform,
        browser=device.browser,
        last_ip=device.last_ip,
        first_seen=device.first_seen,
        last_seen=device.last_seen,
        revoked=device.revoked,
    )


async def list_trusted_devices(user_id: str) -> list[schemas.TrustedDevice]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM trusted_devices
            WHERE user_id = $1
            ORDER BY last_seen DESC
            """,
            user_id,
        )
    devices = [models.TrustedDevice.from_record(row) for row in rows]
    return [
        schemas.TrustedDevice(
            id=device.id,
            label=device.label,
            platform=device.platform,
            browser=device.browser,
            last_ip=device.last_ip,
            first_seen=device.first_seen,
            last_seen=device.last_seen,
            revoked=device.revoked,
        )
        for device in devices
    ]


async def set_trusted_device_label(user_id: str, device_id: UUID, label: str) -> None:
    policy.guard_device_label(label)
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE trusted_devices
            SET label = $3
            WHERE user_id = $1 AND id = $2
            """,
            user_id,
            device_id,
            label,
        )
    if result.endswith("0"):
        raise policy.IdentityPolicyError("trusted_device_not_found")
    obs_metrics.inc_passkey_device("trusted_label")
    await audit.log_event(
        "trusted_device_labeled",
        user_id=user_id,
        meta={"device_id": str(device_id)},
    )


async def revoke_trusted_device(user_id: str, device_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE trusted_devices
            SET revoked = TRUE, last_seen = NOW()
            WHERE user_id = $1 AND id = $2
            """,
            user_id,
            device_id,
        )
    if result.endswith("0"):
        raise policy.IdentityPolicyError("trusted_device_not_found")
    obs_metrics.inc_passkey_device("trusted_revoke")
    await audit.log_event(
        "trusted_device_revoked",
        user_id=user_id,
        meta={"device_id": str(device_id)},
    )


async def revoke_all_trusted_devices(user_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE trusted_devices
            SET revoked = TRUE, last_seen = NOW()
            WHERE user_id = $1
            """,
            user_id,
        )
    obs_metrics.inc_passkey_device("trusted_revoke_all")
    await audit.log_event("trusted_devices_revoked_all", user_id=user_id, meta={})
