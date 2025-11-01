"""Unit tests for the moderation admin tools executor."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
from uuid import uuid4

import pytest
import pytest_asyncio

from app.moderation.domain.enforcement import (
    InMemoryModerationRepository,
    ModerationEnforcer,
    ModerationRepository,
)
from app.moderation.domain.tools import (
    ActionCreateRequest,
    ActionFilter,
    ActionRecord,
    AdminToolsExecutor,
    BundleService,
    GuardEvaluator,
    RunMacroRequest,
    TargetSelector,
)
from app.moderation.domain.tools.catalog import ActionSpec
from app.moderation.domain.tools.jobs import BatchJobScheduler
from app.moderation.domain.tools.revertors import RevertRegistry


@dataclass
class StubCatalog:
    records: Dict[tuple[str, int], ActionRecord]

    async def list_actions(self, filters: ActionFilter) -> List[ActionRecord]:
        key = filters.key
        actions = [record for (record_key, _), record in self.records.items() if key is None or record_key == key]
        if filters.kind is not None:
            actions = [record for record in actions if record.kind == filters.kind]
        if filters.active is not None:
            actions = [record for record in actions if record.is_active == filters.active]
        actions.sort(key=lambda record: (record.key, -record.version))
        return actions

    async def create_action(self, payload: ActionCreateRequest, *, actor_id: str) -> ActionRecord:
        version = payload.version or 1
        spec = payload.spec if isinstance(payload.spec, ActionSpec) else ActionSpec.model_validate(payload.spec)
        record = ActionRecord(key=payload.key, version=version, kind=payload.kind, spec=spec, is_active=payload.activate)
        self.records[(payload.key, version)] = record
        return record

    async def get_action(self, *, key: str, version: int) -> ActionRecord:
        record = self.records.get((key, version))
        if record is None:
            raise KeyError(f"{key}@{version}")
        return record


class DummyHooks:
    async def tombstone(self, case, payload):
        return None

    async def remove(self, case, payload):
        return None

    async def shadow_hide(self, case, payload):
        return None

    async def mute(self, case, payload):
        return None

    async def ban(self, case, payload):
        return None

    async def warn(self, case, payload):
        return None

    async def restrict_create(self, case, payload, expires_at):
        return None


@pytest_asyncio.fixture
async def executor_fixture() -> tuple[AdminToolsExecutor, str, InMemoryModerationRepository, BatchJobScheduler]:
    repo: ModerationRepository = InMemoryModerationRepository()
    hooks = DummyHooks()
    enforcer = ModerationEnforcer(repository=repo, hooks=hooks)

    atomic = ActionRecord(
        key="restrict_create",
        version=1,
        kind="atomic",
        spec=ActionSpec.model_validate({"action": "restrict_create", "payload": {"targets": ["post"], "ttl_minutes": 60}}),
        is_active=True,
    )
    macro = ActionRecord(
        key="spam_sweep",
        version=1,
        kind="macro",
        spec=ActionSpec.model_validate(
            {
                "steps": [
                    {"use": "restrict_create@1", "vars": {"ttl_minutes": 45}},
                ]
            }
        ),
        is_active=True,
    )
    catalog = StubCatalog(records={(atomic.key, atomic.version): atomic, (macro.key, macro.version): macro})
    scheduler = BatchJobScheduler()
    guard = GuardEvaluator()
    bundle = BundleService(catalog=catalog)
    revert_registry = RevertRegistry()

    executor = AdminToolsExecutor(
        catalog=catalog,  # type: ignore[arg-type]
        scheduler=scheduler,
        guard=guard,
        bundle_service=bundle,
        revert_registry=revert_registry,
        case_service=None,  # type: ignore[arg-type]
        enforcer=enforcer,
        repository=repo,
    )

    case = await repo.upsert_case(
        subject_type="post",
        subject_id="post-1",
        reason="test",
        severity=1,
        policy_id=None,
        created_by="admin",
    )
    executor_case_id = case.case_id

    # store selector id for later assertions
    return executor, executor_case_id, repo, scheduler


@pytest.mark.asyncio
async def test_simulate_macro_returns_plan(
    executor_fixture: tuple[AdminToolsExecutor, str, InMemoryModerationRepository, BatchJobScheduler]
) -> None:
    executor, case_id, _, _ = executor_fixture
    selector = TargetSelector(kind="cases", ids=[case_id])
    request = RunMacroRequest(macro="spam_sweep", selector=selector, dry_run=True)
    plan = await executor.simulate_macro(request, actor_id="admin")
    assert plan.count == 1
    assert plan.plan[0]["steps"][0]["use"] == "restrict_create@1"


@pytest.mark.asyncio
async def test_run_macro_executes_and_records_job(
    executor_fixture: tuple[AdminToolsExecutor, str, InMemoryModerationRepository, BatchJobScheduler]
) -> None:
    executor, case_id, repo, scheduler = executor_fixture
    selector = TargetSelector(kind="cases", ids=[case_id])
    request = RunMacroRequest(macro="spam_sweep", selector=selector, dry_run=False)
    handle = await executor.run_macro(request, actor_id="admin")
    assert handle.status == "completed"
    actions = repo.actions.get(case_id, [])
    assert any(entry.action == "restrict_create" for entry in actions)
    items = scheduler._items.get(handle.job_id, [])
    assert len(items) == 1
    assert items[0]["ok"] is True
    assert items[0]["result"]["applied_steps"] == ["restrict_create"]


@pytest.mark.asyncio
async def test_execute_steps_adds_membership_identifiers_from_context(
    executor_fixture: tuple[AdminToolsExecutor, str, InMemoryModerationRepository, BatchJobScheduler]
) -> None:
    executor, _, repo, _ = executor_fixture
    user_id = str(uuid4())
    group_id = str(uuid4())
    case = await repo.upsert_case(
        subject_type="user",
        subject_id=user_id,
        reason="membership",
        severity=1,
        policy_id=None,
        created_by="admin",
    )
    context = {
        "case": case,
        "subject": {"type": "user", "id": user_id, "is_public": True},
        "target": {"type": "user", "id": user_id, "group_id": group_id},
    }
    steps = [{"use": "ban@1", "payload": {}}]

    await executor._execute_steps(steps, context, actor_id="admin", reason_note="test")

    actions = [entry for entries in repo.actions.values() for entry in entries if entry.action == "ban"]
    assert actions, "expected moderation actions to be recorded"
    payload = actions[-1].payload
    assert payload["group_id"] == group_id
    assert payload["user_id"] == user_id
    assert payload["target_user_id"] == user_id


@pytest.mark.asyncio
async def test_execute_steps_falls_back_to_case_group_subject(
    executor_fixture: tuple[AdminToolsExecutor, str, InMemoryModerationRepository, BatchJobScheduler]
) -> None:
    executor, _, repo, _ = executor_fixture
    group_id = str(uuid4())
    user_id = str(uuid4())
    case = await repo.upsert_case(
        subject_type="group",
        subject_id=group_id,
        reason="membership",
        severity=1,
        policy_id=None,
        created_by="admin",
    )
    context = {
        "case": case,
        "subject": {"type": "group", "id": group_id, "is_public": True},
        "target": {"type": "user", "id": user_id},
    }
    steps = [{"use": "mute@1", "payload": {"user_id": user_id}}]

    await executor._execute_steps(steps, context, actor_id="admin", reason_note="test")

    actions = [entry for entries in repo.actions.values() for entry in entries if entry.action == "mute"]
    assert actions, "expected moderation actions to be recorded"
    payload = actions[-1].payload
    assert payload["group_id"] == group_id
    assert payload["user_id"] == user_id