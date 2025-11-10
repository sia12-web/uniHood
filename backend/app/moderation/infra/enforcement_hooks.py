"""Production enforcement hooks that touch upstream domain services."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Mapping, Tuple
from uuid import UUID, uuid4

from app.communities.domain import repo as communities_repo
from app.communities.domain.exceptions import NotFoundError
from app.communities.domain.notifications_service import NotificationService
from app.moderation.domain.enforcement import EnforcementHooks, ModerationCase
from app.moderation.domain.membership_utils import ensure_membership_identifiers
from app.moderation.domain.restrictions import RestrictionService

logger = logging.getLogger(__name__)


class CommunitiesEnforcementHooks(EnforcementHooks):
    """Apply moderation actions against communities entities."""

    _SYSTEM_ACTOR = UUID(int=0)

    def __init__(
        self,
        *,
        repository: communities_repo.CommunitiesRepository | None = None,
        notifications: NotificationService | None = None,
        restrictions: RestrictionService | None = None,
    ) -> None:
        self._repo = repository or communities_repo.CommunitiesRepository()
        self._notifications = notifications or NotificationService(repository=self._repo)
        self._restrictions = restrictions

    async def tombstone(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        await self._soft_delete(case, action="tombstone")

    async def remove(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        await self._soft_delete(case, action="remove")

    async def shadow_hide(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        await self._soft_delete(case, action="shadow_hide")

    async def mute(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        result = self._resolve_membership_target("mute", case, payload)
        if result is None:
            return
        group_id, user_id, payload_dict = result
        muted_until = self._parse_datetime(payload_dict.get("muted_until"))
        try:
            await self._repo.update_member_properties(group_id, user_id, muted_until=muted_until)
        except NotFoundError:
            await self._repo.upsert_member(
                group_id,
                user_id,
                role="member",
                muted_until=muted_until,
            )
        except Exception:  # noqa: BLE001 - best-effort enforcement
            logger.exception(
                "Failed to apply mute",
                extra={
                    "case_id": case.case_id,
                    "group_id": str(group_id),
                    "user_id": str(user_id),
                },
            )

    async def ban(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        result = self._resolve_membership_target("ban", case, payload)
        if result is None:
            return
        group_id, user_id, payload_dict = result
        ban_state = bool(payload_dict.get("is_banned", True))
        try:
            await self._repo.update_member_properties(group_id, user_id, is_banned=ban_state)
        except NotFoundError:
            await self._repo.upsert_member(
                group_id,
                user_id,
                role="member",
                is_banned=ban_state,
            )
        except Exception:  # noqa: BLE001 - best-effort enforcement
            logger.exception(
                "Failed to apply ban",
                extra={
                    "case_id": case.case_id,
                    "group_id": str(group_id),
                    "user_id": str(user_id),
                },
            )

    async def warn(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        recipient = await self._resolve_warn_recipient(case, payload)
        if recipient is None:
            logger.warning(
                "Moderation warn missing recipient",
                extra={"case_id": case.case_id, "subject_type": case.subject_type},
            )
            return
        if not self._notifications:
            logger.warning(
                "Moderation warn skipped: notifications not configured",
                extra={"case_id": case.case_id, "recipient": str(recipient)},
            )
            return
        notification_type = str(payload.get("notification_type", "moderation.warn"))
        actor_uuid = self._parse_uuid(payload.get("actor_id"))
        if actor_uuid is None:
            actor_uuid = self._parse_uuid(case.assigned_to) or self._parse_uuid(case.created_by) or self._SYSTEM_ACTOR
        ref_uuid = self._parse_uuid(payload.get("ref_id"))
        if ref_uuid is None:
            ref_uuid = self._parse_uuid(case.subject_id) or uuid4()
        body = {"case_id": case.case_id, "severity": case.severity, "payload": dict(payload)}
        try:
            await self._notifications.persist_notification(
                user_id=recipient,
                type=notification_type,
                ref_id=ref_uuid,
                actor_id=actor_uuid,
                payload=body,
            )
        except Exception:  # noqa: BLE001 - notifications are best effort
            logger.exception(
                "Failed to persist moderation warning",
                extra={
                    "case_id": case.case_id,
                    "recipient": str(recipient),
                    "subject_type": case.subject_type,
                },
            )

    async def restrict_create(
        self,
        case: ModerationCase,
        payload: Mapping[str, Any],
        expires_at: datetime,
    ) -> None:
        if not self._restrictions:
            logger.warning(
                "Moderation restrict-create skipped: restrictions service not configured",
                extra={"case_id": case.case_id},
            )
            return
        user_uuid = await self._resolve_restriction_user(case, payload)
        if user_uuid is None:
            logger.warning(
                "Moderation restrict-create missing user",
                extra={"case_id": case.case_id, "subject_type": case.subject_type},
            )
            return
        raw_targets = payload.get("targets")
        if isinstance(raw_targets, (list, tuple, set)):
            targets = list(raw_targets) if raw_targets else [payload.get("scope") or "global"]
        else:
            single = raw_targets or payload.get("scope")
            targets = [single or "global"]
        ttl_minutes = _extract_ttl_minutes(payload, expires_at)
        reason = str(payload.get("reason") or case.reason or "restrict_create")
        try:
            for target in targets:
                scope = str(target)
                await self._restrictions.apply_cooldown(
                    user_id=str(user_uuid),
                    scope=scope,
                    minutes=max(1, ttl_minutes),
                    reason=reason,
                )
        except Exception:  # noqa: BLE001 - enforcement must not crash worker
            logger.exception(
                "Failed to apply restrict-create",
                extra={
                    "case_id": case.case_id,
                    "user_id": str(user_uuid),
                    "targets": [str(t) for t in targets],
                },
            )

    async def _soft_delete(self, case: ModerationCase, *, action: str) -> None:
        subject_type = case.subject_type
        handler = {
            "post": self._repo.soft_delete_post,
            "comment": self._repo.soft_delete_comment,
            "group": self._repo.soft_delete_group,
            "event": self._repo.soft_delete_event,
        }.get(subject_type)
        if handler is None:
            logger.warning(
                "Unsupported moderation subject for enforcement",
                extra={"case_id": case.case_id, "subject_type": subject_type, "action": action},
            )
            return
        subject_uuid = self._parse_uuid(case.subject_id)
        if subject_uuid is None:
            logger.warning(
                "Moderation subject id is not a valid UUID",
                extra={"case_id": case.case_id, "subject_id": case.subject_id, "action": action},
            )
            return
        try:
            await handler(subject_uuid)  # type: ignore[arg-type]
        except NotFoundError:
            logger.info(
                "Moderation target already removed",
                extra={
                    "case_id": case.case_id,
                    "subject_type": subject_type,
                    "subject_id": case.subject_id,
                    "action": action,
                },
            )
        except Exception:
            logger.exception(
                "Moderation enforcement failed",
                extra={
                    "case_id": case.case_id,
                    "subject_type": subject_type,
                    "subject_id": case.subject_id,
                    "action": action,
                },
            )

    def _parse_uuid(self, value: str) -> UUID | None:
        try:
            return UUID(str(value))
        except (ValueError, TypeError):
            return None

    def _resolve_membership_target(
        self,
        action: str,
        case: ModerationCase,
        payload: Mapping[str, Any],
    ) -> Tuple[UUID, UUID, Mapping[str, Any]] | None:
        payload_dict: dict[str, Any] = dict(payload or {})
        complete = ensure_membership_identifiers(
            action,
            payload_dict,
            case=case,
            subject={"type": case.subject_type, "id": case.subject_id},
        )
        if not complete:
            logger.warning(
                "Membership context missing for enforcement",
                extra={
                    "case_id": case.case_id,
                    "action": action,
                    "subject_type": case.subject_type,
                },
            )
            return None
        group_uuid = self._parse_uuid(payload_dict.get("group_id"))
        user_uuid = self._parse_uuid(payload_dict.get("user_id"))
        if not group_uuid or not user_uuid:
            logger.warning(
                "Invalid membership identifiers for enforcement",
                extra={
                    "case_id": case.case_id,
                    "action": action,
                    "group_id": payload_dict.get("group_id"),
                    "user_id": payload_dict.get("user_id"),
                },
            )
            return None
        return group_uuid, user_uuid, payload_dict

    def _parse_datetime(self, value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc)
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                logger.warning("Unable to parse muted_until value", extra={"value": value})
                return None
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        logger.warning("Unsupported muted_until type", extra={"type": type(value).__name__})
        return None

    async def _resolve_warn_recipient(self, case: ModerationCase, payload: Mapping[str, Any]) -> UUID | None:
        override = payload.get("user_id") or payload.get("target_user_id")
        candidate = self._parse_uuid(override)
        if candidate:
            return candidate
        subject_uuid = self._parse_uuid(case.subject_id)
        match case.subject_type:
            case "user":
                return subject_uuid
            case "post":
                if subject_uuid:
                    post = await self._repo.get_post(subject_uuid)
                    return post.author_id if post else None
            case "comment":
                if subject_uuid:
                    comment = await self._repo.get_comment(subject_uuid)
                    return comment.author_id if comment else None
            case "group":
                if subject_uuid:
                    group = await self._repo.get_group(subject_uuid)
                    return group.created_by if group else None
        return None

    async def _resolve_restriction_user(self, case: ModerationCase, payload: Mapping[str, Any]) -> UUID | None:
        override = payload.get("user_id") or payload.get("target_user_id")
        candidate = self._parse_uuid(override)
        if candidate:
            return candidate
        subject_uuid = self._parse_uuid(case.subject_id)
        if case.subject_type == "user":
            return subject_uuid
        if case.subject_type == "comment" and subject_uuid:
            comment = await self._repo.get_comment(subject_uuid)
            return comment.author_id if comment else None
        if case.subject_type == "post" and subject_uuid:
            post = await self._repo.get_post(subject_uuid)
            return post.author_id if post else None
        return None


def _extract_ttl_minutes(payload: Mapping[str, Any], expires_at: datetime) -> int:
    ttl = payload.get("ttl_minutes")
    if ttl is not None:
        try:
            minutes = int(ttl)
            if minutes > 0:
                return minutes
        except (TypeError, ValueError):
            pass
    remaining = int((expires_at - datetime.now(timezone.utc)).total_seconds() // 60)
    return max(1, remaining)
