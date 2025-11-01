"""Revertor registry for moderation bulk operations."""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Dict, Mapping, Optional, Sequence
from uuid import UUID

from app.communities.domain.exceptions import NotFoundError
from app.moderation.domain.enforcement import ModerationCase, ModerationRepository
from app.moderation.domain.restrictions import RestrictionService

if TYPE_CHECKING:  # pragma: no cover - typing helpers only
    from app.communities.domain.notifications_service import NotificationService
    from app.communities.domain.repo import CommunitiesRepository
    from app.moderation.domain.cases_service import SubjectResolver


Revertor = Callable[[Mapping[str, Any]], Any | Awaitable[Any]]


@dataclass(slots=True)
class _RevertContext:
    action: str
    actor_id: Optional[str]
    subject_type: str
    subject_id: str
    case_id: Optional[str]
    payload: Mapping[str, Any]

    @classmethod
    def from_payload(cls, action: str, payload: Mapping[str, Any]) -> "_RevertContext":
        target = payload.get("target") or payload.get("subject")
        if not isinstance(target, Mapping):
            raise ValueError("revert.missing_target")
        subject_type = str(target.get("type") or "").strip()
        subject_id = str(target.get("id") or "").strip()
        if not subject_type or not subject_id:
            raise ValueError("revert.invalid_target")
        actor_raw = payload.get("actor_id")
        case_id = target.get("case_id")
        if not case_id and isinstance(payload.get("case"), ModerationCase):
            case_id = payload["case"].case_id  # type: ignore[index]
        return cls(
            action=action,
            actor_id=str(actor_raw) if actor_raw else None,
            subject_type=subject_type,
            subject_id=subject_id,
            case_id=str(case_id) if case_id else None,
            payload=payload,
        )


@dataclass(slots=True)
class _MembershipInfo:
    group_id: UUID
    user_id: UUID


@dataclass(slots=True)
class ContentRestorer:
    """Restores soft-deleted community content when possible."""

    repository: "CommunitiesRepository" | None = None

    async def restore(self, subject_type: str, subject_id: str) -> Mapping[str, Any]:
        if self.repository is None:
            return {"status": "skipped", "reason": "repository_missing"}
        subject_uuid = _to_uuid(subject_id)
        if subject_uuid is None:
            raise ValueError("revert.invalid_subject_id")
        if subject_type == "post":
            await self.repository.restore_post(subject_uuid)
        elif subject_type == "comment":
            await self.repository.restore_comment(subject_uuid)
        elif subject_type == "group":
            await self.repository.restore_group(subject_uuid)
        elif subject_type == "event":
            await self.repository.restore_event(subject_uuid)
        else:
            raise ValueError(f"revert.unsupported_subject.{subject_type}")
        return {"status": "restored", "subject_type": subject_type, "subject_id": subject_id}


@dataclass(slots=True)
class MembershipRestorer:
    """Clears moderation flags on group memberships."""

    repository: "CommunitiesRepository" | None = None

    async def revert(
        self,
        *,
        action: str,
        context: _RevertContext,
        action_payload: Mapping[str, Any] | None,
    ) -> Mapping[str, Any]:
        if self.repository is None:
            return {"status": "skipped", "reason": "repository_missing"}
        info = _extract_membership_info(context, action_payload)
        if info is None:
            return {"status": "skipped", "reason": "membership_payload_missing"}
        try:
            member = await self.repository.clear_member_moderation(
                group_id=info.group_id,
                user_id=info.user_id,
                clear_ban=action == "ban",
                clear_mute=action == "mute",
            )
        except NotFoundError:
            return {
                "status": "skipped",
                "reason": "membership_not_found",
                "group_id": str(info.group_id),
                "user_id": str(info.user_id),
                "action": action,
            }
        return {
            "status": "membership_restored",
            "action": action,
            "group_id": str(member.group_id),
            "user_id": str(member.user_id),
            "is_banned": bool(getattr(member, "is_banned", False)),
            "muted_until": getattr(member, "muted_until", None).isoformat()
            if getattr(member, "muted_until", None)
            else None,
        }


@dataclass(slots=True)
class RestrictionReverter:
    """Reverts restriction ledger entries when present."""

    service: RestrictionService | None = None

    async def revert(
        self,
        *,
        context: _RevertContext,
        action_payload: Mapping[str, Any] | None,
    ) -> Mapping[str, Any]:
        if self.service is None or not action_payload:
            return {"status": "acknowledged", "action": context.action}
        revoked: list[str] = []
        restriction_ids = action_payload.get("restriction_ids")
        if isinstance(restriction_ids, Sequence):
            for rid in restriction_ids:
                rid_str = str(rid)
                try:
                    await self.service.revoke(rid_str)
                except Exception:  # noqa: BLE001 - best-effort cleanup
                    continue
                revoked.append(rid_str)
        status = "restrictions_revoked" if revoked else "acknowledged"
        return {"status": status, "action": context.action, "revoked": revoked}


@dataclass(slots=True)
class NotificationBroadcaster:
    """Emits moderation notifications when bulk actions are reverted."""

    subject_resolver: "SubjectResolver" | None = None
    notifications: "NotificationService" | None = None

    async def content_restored(self, context: _RevertContext) -> None:
        if self.subject_resolver is None or self.notifications is None:
            return
        try:
            owner_id = await self.subject_resolver.resolve_owner(context.subject_type, context.subject_id)
        except Exception:  # noqa: BLE001 - do not block revert flow on resolver failures
            return
        if not owner_id:
            return
        owner_uuid = _to_uuid(owner_id)
        ref_uuid = _to_uuid(context.subject_id)
        actor_uuid = _to_uuid(context.actor_id) or owner_uuid
        if owner_uuid is None or ref_uuid is None or actor_uuid is None:
            return
        payload = {
            "case_id": context.case_id,
            "subject_type": context.subject_type,
            "subject_id": context.subject_id,
            "action": context.action,
        }
        try:
            await self.notifications.persist_notification(
                user_id=owner_uuid,
                type="moderation.content.restored",
                ref_id=ref_uuid,
                actor_id=actor_uuid,
                payload=payload,
            )
        except Exception:  # noqa: BLE001 - notification failures must not break revert processing
            return

    async def acknowledged(self, context: _RevertContext) -> None:
        return None

    async def membership_restored(self, context: _RevertContext, details: Mapping[str, Any]) -> None:
        if self.notifications is None:
            return
        user_uuid = _to_uuid(str(details.get("user_id"))) if details.get("user_id") else _to_uuid(context.subject_id)
        group_uuid = _to_uuid(str(details.get("group_id")))
        actor_uuid = _to_uuid(context.actor_id) or user_uuid
        if user_uuid is None or group_uuid is None or actor_uuid is None:
            return
        payload = {
            "case_id": context.case_id,
            "group_id": str(group_uuid),
            "subject_type": context.subject_type,
            "subject_id": context.subject_id,
            "action": context.action,
            "muted_until": details.get("muted_until"),
            "is_banned": details.get("is_banned"),
        }
        try:
            await self.notifications.persist_notification(
                user_id=user_uuid,
                type="moderation.membership.restored",
                ref_id=group_uuid,
                actor_id=actor_uuid,
                payload=payload,
            )
        except Exception:  # noqa: BLE001 - notification failures must not break revert processing
            return


@dataclass(slots=True)
class RevertRegistry:
    """Keeps mapping between actions and revert handlers."""

    registry: Dict[str, Revertor] = field(default_factory=dict)

    async def revert(self, action: str, payload: Mapping[str, Any]) -> Any:
        handler = self.registry.get(action)
        if handler is None:
            raise ValueError(f"revert.unsupported_action.{action}")
        result = handler(payload)
        if inspect.isawaitable(result):
            return await result
        return result

    def register(self, action: str, handler: Revertor) -> None:
        self.registry[action] = handler


def build_default_registry(
    *,
    moderation_repo: ModerationRepository,
    content_restorer: ContentRestorer | None = None,
    membership_restorer: MembershipRestorer | None = None,
    restriction_service: RestrictionService | None = None,
    notifier: NotificationBroadcaster | None = None,
) -> RevertRegistry:
    """Configure the default revert registry used by the admin tools executor."""

    restorer = content_restorer or ContentRestorer()
    membership = membership_restorer or MembershipRestorer()
    restriction_reverter = RestrictionReverter(service=restriction_service)
    broadcaster = notifier or NotificationBroadcaster()
    registry = RevertRegistry()

    async def _lookup_action_payload(context: _RevertContext, action: str) -> Mapping[str, Any] | None:
        if not context.case_id:
            return None
        actions: Sequence[Any] = await moderation_repo.list_actions(context.case_id)
        for entry in reversed(list(actions)):
            entry_action = getattr(entry, "action", None)
            if entry_action != action:
                continue
            raw_payload = getattr(entry, "payload", {})
            if isinstance(raw_payload, Mapping):
                return dict(raw_payload)
            return {"value": raw_payload}
        return None

    async def _audit(context: _RevertContext, action: str, result: Mapping[str, Any]) -> None:
        await moderation_repo.audit(
            context.actor_id,
            f"batch.revert.{action}",
            context.subject_type,
            context.subject_id,
            {
                "case_id": context.case_id,
                "action": action,
                "result": result,
            },
        )

    async def _restore(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        context = _RevertContext.from_payload(action, payload)
        result = await restorer.restore(context.subject_type, context.subject_id)
        await _audit(context, action, result)
        await broadcaster.content_restored(context)
        return result

    async def _restore_membership(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        context = _RevertContext.from_payload(action, payload)
        action_payload = await _lookup_action_payload(context, action)
        result = await membership.revert(action=action, context=context, action_payload=action_payload)
        await _audit(context, action, result)
        if result.get("status") == "membership_restored":
            await broadcaster.membership_restored(context, result)
        return result

    async def _restore_restriction(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        context = _RevertContext.from_payload(action, payload)
        action_payload = await _lookup_action_payload(context, action)
        result = await restriction_reverter.revert(context=context, action_payload=action_payload)
        await _audit(context, action, result)
        return result

    async def _acknowledge(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        context = _RevertContext.from_payload(action, payload)
        result = {"status": "acknowledged", "action": action}
        await _audit(context, action, result)
        await broadcaster.acknowledged(context)
        return result

    async def _restore_wrapper(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        return await _restore(payload, action=action)

    async def _membership_wrapper(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        return await _restore_membership(payload, action=action)

    async def _ack_wrapper(payload: Mapping[str, Any], *, action: str) -> Mapping[str, Any]:
        return await _acknowledge(payload, action=action)

    registry.register("remove", lambda payload: _restore_wrapper(payload, action="remove"))
    registry.register("shadow_hide", lambda payload: _restore_wrapper(payload, action="shadow_hide"))
    registry.register("tombstone", lambda payload: _restore_wrapper(payload, action="tombstone"))
    registry.register("restrict_create", lambda payload: _restore_restriction(payload, action="restrict_create"))
    registry.register("mute", lambda payload: _membership_wrapper(payload, action="mute"))
    registry.register("ban", lambda payload: _membership_wrapper(payload, action="ban"))
    return registry


def get_revert_registry() -> RevertRegistry:
    """Constructs a default registry placeholder."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_revert_registry_instance()


__all__ = [
    "ContentRestorer",
    "MembershipRestorer",
    "NotificationBroadcaster",
    "RestrictionReverter",
    "RevertRegistry",
    "Revertor",
    "build_default_registry",
    "get_revert_registry",
]


def _extract_membership_info(
    context: _RevertContext,
    action_payload: Mapping[str, Any] | None,
) -> _MembershipInfo | None:
    if action_payload is None:
        return None
    group_val = action_payload.get("group_id") or action_payload.get("group") or action_payload.get("group_uuid")
    user_val = (
        action_payload.get("user_id")
        or action_payload.get("member_id")
        or action_payload.get("target_user_id")
        or context.subject_id
    )
    group_uuid = _to_uuid(str(group_val)) if group_val else None
    user_uuid = _to_uuid(str(user_val)) if user_val else None
    if group_uuid is None or user_uuid is None:
        return None
    return _MembershipInfo(group_id=group_uuid, user_id=user_uuid)


def _to_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None
