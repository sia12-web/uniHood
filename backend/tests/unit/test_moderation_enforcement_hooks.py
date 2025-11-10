from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.communities.domain.exceptions import NotFoundError
from app.moderation.domain.enforcement import ModerationCase
from app.moderation.infra.enforcement_hooks import CommunitiesEnforcementHooks


class StubCommunitiesRepo:
    def __init__(self) -> None:
        self.update_calls: list[dict[str, object]] = []
        self.upsert_calls: list[dict[str, object]] = []
        self.raise_not_found = False
        self.posts: dict[object, SimpleNamespace] = {}
        self.comments: dict[object, SimpleNamespace] = {}
        self.groups: dict[object, SimpleNamespace] = {}

    async def update_member_properties(
        self,
        group_id,
        user_id,
        *,
        role=None,
        muted_until=None,
        is_banned=None,
    ):
        call = {
            "group_id": group_id,
            "user_id": user_id,
            "role": role,
            "muted_until": muted_until,
            "is_banned": is_banned,
        }
        self.update_calls.append(call)
        if self.raise_not_found:
            raise NotFoundError("member_not_found")
        return call

    async def upsert_member(
        self,
        group_id,
        user_id,
        *,
        role,
        muted_until=None,
        is_banned=None,
    ):
        call = {
            "group_id": group_id,
            "user_id": user_id,
            "role": role,
            "muted_until": muted_until,
            "is_banned": is_banned,
        }
        self.upsert_calls.append(call)
        return call

    async def get_post(self, post_id):
        return self.posts.get(post_id)

    async def get_comment(self, comment_id):
        return self.comments.get(comment_id)

    async def get_group(self, group_id):
        return self.groups.get(group_id)


class StubNotifications:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def persist_notification(self, *, user_id, type, ref_id, actor_id, payload, max_per_second: int = 5):  # noqa: A003 - match signature
        self.calls.append(
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
        self.cooldowns: list[dict[str, object]] = []

    async def apply_cooldown(self, *, user_id: str, scope: str, minutes: int, reason: str) -> None:
        self.cooldowns.append({"user_id": user_id, "scope": scope, "minutes": minutes, "reason": reason})


@pytest.mark.asyncio
async def test_mute_updates_existing_membership() -> None:
    repo = StubCommunitiesRepo()
    hooks = CommunitiesEnforcementHooks(repository=repo)
    group_id = uuid4()
    user_id = uuid4()
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="group",
        subject_id=str(group_id),
        status="open",
        reason="policy",
        severity=1,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=None,
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )
    muted_at = "2025-10-30T21:15:00Z"

    await hooks.mute(case, {"user_id": str(user_id), "muted_until": muted_at})

    assert repo.update_calls, "expected membership update"
    call = repo.update_calls[0]
    assert call["group_id"] == group_id
    assert call["user_id"] == user_id
    assert isinstance(call["muted_until"], datetime)
    assert call["muted_until"].tzinfo is timezone.utc


@pytest.mark.asyncio
async def test_ban_upserts_when_member_missing() -> None:
    repo = StubCommunitiesRepo()
    repo.raise_not_found = True
    hooks = CommunitiesEnforcementHooks(repository=repo)
    group_id = uuid4()
    user_id = uuid4()
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="group",
        subject_id=str(group_id),
        status="open",
        reason="policy",
        severity=1,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=None,
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )

    await hooks.ban(case, {"user_id": str(user_id)})

    assert repo.update_calls, "expected initial update attempt"
    assert repo.upsert_calls, "expected upsert fallback"
    upsert_call = repo.upsert_calls[0]
    assert upsert_call["group_id"] == group_id
    assert upsert_call["user_id"] == user_id
    assert upsert_call["is_banned"] is True
    assert upsert_call["role"] == "member"


@pytest.mark.asyncio
async def test_warn_notifies_post_author() -> None:
    repo = StubCommunitiesRepo()
    notifications = StubNotifications()
    post_id = uuid4()
    author_id = uuid4()
    repo.posts[post_id] = SimpleNamespace(author_id=author_id)
    hooks = CommunitiesEnforcementHooks(repository=repo, notifications=notifications)
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="post",
        subject_id=str(post_id),
        status="open",
        reason="auto_policy",
        severity=2,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=None,
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )

    await hooks.warn(case, {"message": "please review"})

    assert notifications.calls, "expected notification to be persisted"
    payload = notifications.calls[0]
    assert payload["user_id"] == author_id
    assert payload["type"] == "moderation.warn"
    assert payload["payload"]["case_id"] == case.case_id


@pytest.mark.asyncio
async def test_restrict_create_applies_cooldowns() -> None:
    repo = StubCommunitiesRepo()
    restrictions = StubRestrictionService()
    user_id = uuid4()
    hooks = CommunitiesEnforcementHooks(repository=repo, restrictions=restrictions)
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="user",
        subject_id=str(user_id),
        status="open",
        reason="auto_policy",
        severity=1,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=None,
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )
    ttl_minutes = 45
    payload = {"targets": ["post", "comment"], "ttl_minutes": ttl_minutes, "reason": "low_trust"}

    await hooks.restrict_create(
        case,
        payload,
        datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
    )

    assert restrictions.cooldowns == [
        {"user_id": str(user_id), "scope": "post", "minutes": ttl_minutes, "reason": "low_trust"},
        {"user_id": str(user_id), "scope": "comment", "minutes": ttl_minutes, "reason": "low_trust"},
    ]
