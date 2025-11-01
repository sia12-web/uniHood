from __future__ import annotations

from datetime import datetime, timezone
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
