"""Unit coverage for moderation revert registry handlers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional
from uuid import UUID, uuid4

import pytest

from app.moderation.domain.tools.revertors import ContentRestorer, MembershipRestorer, NotificationBroadcaster, build_default_registry


@dataclass
class StubActionRecord:
    action: str
    payload: Mapping[str, Any]


@dataclass
class StubModerationRepo:
    audits: list[Dict[str, Any]]
    actions: Dict[str, list[StubActionRecord]] | None = None

    async def audit(self, actor_id: Optional[str], action: str, target_type: str, target_id: str, meta: Mapping[str, Any]) -> None:
        self.audits.append(
            {
                "actor_id": actor_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "meta": dict(meta),
            }
        )

    async def list_actions(self, case_id: str) -> list[StubActionRecord]:
        if not self.actions:
            return []
        return list(self.actions.get(case_id, []))


class StubCommunitiesRepo:
    def __init__(self) -> None:
        self.operations: list[tuple[str, UUID]] = []
        self.membership_calls: list[Dict[str, Any]] = []
        self.member_result: StubMember | None = None

    async def restore_post(self, post_id: UUID) -> None:
        self.operations.append(("post", post_id))

    async def restore_comment(self, comment_id: UUID) -> None:
        self.operations.append(("comment", comment_id))

    async def restore_group(self, group_id: UUID) -> None:
        self.operations.append(("group", group_id))

    async def restore_event(self, event_id: UUID) -> None:
        self.operations.append(("event", event_id))

    async def clear_member_moderation(
        self,
        *,
        group_id: UUID,
        user_id: UUID,
        clear_ban: bool,
        clear_mute: bool,
    ) -> StubMember:
        self.membership_calls.append(
            {
                "group_id": group_id,
                "user_id": user_id,
                "clear_ban": clear_ban,
                "clear_mute": clear_mute,
            }
        )
        if self.member_result is None:
            raise AssertionError("member_result must be provided for membership tests")
        return self.member_result


class StubSubjectResolver:
    def __init__(self, owner_id: str) -> None:
        self.owner_id = owner_id
        self.calls: list[tuple[str, str]] = []

    async def resolve_owner(self, subject_type: str, subject_id: str) -> Optional[str]:
        self.calls.append((subject_type, subject_id))
        return self.owner_id


class StubNotificationService:
    def __init__(self) -> None:
        self.messages: list[Dict[str, Any]] = []

    async def persist_notification(
        self,
        *,
        user_id: UUID,
        type: str,
        ref_id: UUID,
        actor_id: UUID,
        payload: Dict[str, Any],
        max_per_second: int = 5,
    ) -> tuple[None, bool]:
        self.messages.append(
            {
                "user_id": user_id,
                "type": type,
                "ref_id": ref_id,
                "actor_id": actor_id,
                "payload": payload,
            }
        )
        return None, True


class StubRestrictionService:
    def __init__(self) -> None:
        self.revocations: list[str] = []

    async def revoke(self, restriction_id: str) -> None:
        self.revocations.append(restriction_id)


@dataclass
class StubMember:
    group_id: UUID
    user_id: UUID
    is_banned: bool = False
    muted_until: Any | None = None


@pytest.mark.asyncio
async def test_remove_action_restores_content_and_audits() -> None:
    moderation_repo = StubModerationRepo(audits=[])
    communities_repo = StubCommunitiesRepo()
    owner_id = str(uuid4())
    resolver = StubSubjectResolver(owner_id)
    notifications = StubNotificationService()
    registry = build_default_registry(
        moderation_repo=moderation_repo,
        content_restorer=ContentRestorer(repository=communities_repo),
        notifier=NotificationBroadcaster(subject_resolver=resolver, notifications=notifications),
    )
    subject_id = str(uuid4())
    payload = {
        "target": {"type": "post", "id": subject_id, "case_id": "case-123"},
        "actor_id": str(uuid4()),
    }

    result = await registry.revert("remove", payload)

    assert result["status"] == "restored"
    assert ("post", UUID(subject_id)) in communities_repo.operations
    assert len(moderation_repo.audits) == 1
    audit_entry = moderation_repo.audits[0]
    assert audit_entry["action"] == "batch.revert.remove"
    assert notifications.messages[0]["type"] == "moderation.content.restored"
    assert resolver.calls == [("post", subject_id)]


@pytest.mark.asyncio
async def test_restrict_create_records_acknowledgement() -> None:
    moderation_repo = StubModerationRepo(audits=[])
    registry = build_default_registry(moderation_repo=moderation_repo)
    subject_id = str(uuid4())
    payload = {
        "target": {"type": "user", "id": subject_id, "case_id": "case-456"},
        "actor_id": str(uuid4()),
    }

    result = await registry.revert("restrict_create", payload)

    assert result == {"status": "acknowledged", "action": "restrict_create"}
    assert len(moderation_repo.audits) == 1
    assert moderation_repo.audits[0]["action"] == "batch.revert.restrict_create"


@pytest.mark.asyncio
async def test_restriction_revocations_are_triggered_when_payload_available() -> None:
    restriction_service = StubRestrictionService()
    case_id = "case-789"
    action_payload = {"restriction_ids": ["r1", "r2"]}
    moderation_repo = StubModerationRepo(
        audits=[],
        actions={case_id: [StubActionRecord(action="restrict_create", payload=action_payload)]},
    )
    registry = build_default_registry(
        moderation_repo=moderation_repo,
        restriction_service=restriction_service,
    )
    payload = {
        "target": {"type": "user", "id": str(uuid4()), "case_id": case_id},
        "actor_id": str(uuid4()),
    }

    result = await registry.revert("restrict_create", payload)

    assert result["status"] == "restrictions_revoked"
    assert result["revoked"] == ["r1", "r2"]
    assert restriction_service.revocations == ["r1", "r2"]


@pytest.mark.asyncio
async def test_membership_reverter_uses_lookup_payload() -> None:
    communities_repo = StubCommunitiesRepo()
    member = StubMember(group_id=uuid4(), user_id=uuid4())
    communities_repo.member_result = member
    case_id = "case-mute"
    moderation_repo = StubModerationRepo(
        audits=[],
        actions={
            case_id: [
                StubActionRecord(
                    action="mute",
                    payload={"group_id": str(member.group_id), "user_id": str(member.user_id)},
                )
            ]
        },
    )
    registry = build_default_registry(
        moderation_repo=moderation_repo,
        membership_restorer=MembershipRestorer(repository=communities_repo),
    )
    payload = {
        "target": {"type": "user", "id": str(member.user_id), "case_id": case_id},
        "actor_id": str(uuid4()),
    }

    result = await registry.revert("mute", payload)

    assert result["status"] == "membership_restored"
    assert result["group_id"] == str(member.group_id)
    assert communities_repo.membership_calls[0]["clear_mute"] is True
    assert communities_repo.membership_calls[0]["clear_ban"] is False
    assert len(moderation_repo.audits) == 1