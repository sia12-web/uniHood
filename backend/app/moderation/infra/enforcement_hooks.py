"""Production enforcement hooks that touch upstream domain services."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Mapping, Tuple
from uuid import UUID

from app.communities.domain import repo as communities_repo
from app.communities.domain.exceptions import NotFoundError
from app.moderation.domain.enforcement import EnforcementHooks, ModerationCase
from app.moderation.domain.membership_utils import ensure_membership_identifiers

logger = logging.getLogger(__name__)


class CommunitiesEnforcementHooks(EnforcementHooks):
    """Apply moderation actions against communities entities."""

    def __init__(self, repository: communities_repo.CommunitiesRepository | None = None) -> None:
        self._repo = repository or communities_repo.CommunitiesRepository()

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
        logger.warning(
            "Moderation warn enforcement not wired yet",
            extra={"case_id": case.case_id, "subject_type": case.subject_type},
        )

    async def restrict_create(
        self,
        case: ModerationCase,
        payload: Mapping[str, Any],
        expires_at: datetime,
    ) -> None:
        logger.warning(
            "Moderation restrict-create enforcement not wired yet",
            extra={
                "case_id": case.case_id,
                "subject_type": case.subject_type,
                "subject_id": case.subject_id,
                "expires_at": expires_at.isoformat(),
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
