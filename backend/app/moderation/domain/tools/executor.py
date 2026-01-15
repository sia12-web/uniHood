"""Execution engine for moderation admin tools."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Literal, Mapping, Optional, Sequence, Tuple

from app.moderation.domain.cases_service import CaseService
from app.moderation.domain.enforcement import ModerationCase, ModerationEnforcer, ModerationRepository
from app.moderation.domain.policy_engine import Decision

from pydantic import BaseModel, Field

from . import bundle_io, guards, jobs, revertors
from app.moderation.domain.membership_utils import ensure_membership_identifiers
from .catalog import ActionFilter, ActionRecord, ActionsCatalogService

SelectorKind = Literal["cases", "subjects", "query"]
SubjectKind = Literal["post", "comment", "user", "group", "event"]


class QueryFilter(BaseModel):
    """Filter parameters for query selectors."""

    campus_id: Optional[str] = None
    created_from: Optional[str] = None
    created_to: Optional[str] = None
    shadow_only: Optional[bool] = None
    actor_id: Optional[str] = None


class TargetSelector(BaseModel):
    """Represents the target selection strategy."""

    kind: SelectorKind
    ids: Optional[List[str]] = None
    subject_type: Optional[SubjectKind] = None
    filter: Optional[QueryFilter] = None


class RunMacroRequest(BaseModel):
    """Request body for macro execution or simulation."""

    macro: str
    selector: TargetSelector
    dry_run: Optional[bool] = True
    sample_size: Optional[int] = Field(default=None, ge=0)
    reason_note: Optional[str] = None
    variables: Optional[Dict[str, Any]] = None


class MacroPlan(BaseModel):
    """Dry-run plan response."""

    count: int
    plan: List[Dict[str, Any]] = Field(default_factory=list)


class BatchRevertRequest(BaseModel):
    """Request body for batch revert execution."""

    actions: List[Literal["remove", "ban", "mute", "restrict_create", "shadow_hide"]]
    selector: TargetSelector
    dry_run: Optional[bool] = True
    sample_size: Optional[int] = Field(default=None, ge=0)


class BatchUnshadowRequest(BaseModel):
    """Request body for batch unshadow execution."""

    selector: TargetSelector
    dry_run: Optional[bool] = True
    sample_size: Optional[int] = Field(default=None, ge=0)


class BundleImportRequest(BaseModel):
    """Request body for YAML bundle imports."""

    yaml: str
    enable: Optional[bool] = False
    dry_run: Optional[bool] = True


@dataclass(slots=True)
class AdminToolsExecutor:
    """Coordinates macro execution and batch jobs."""

    catalog: ActionsCatalogService
    scheduler: jobs.BatchJobScheduler
    guard: guards.GuardEvaluator
    bundle_service: bundle_io.BundleService
    revert_registry: revertors.RevertRegistry
    case_service: CaseService
    enforcer: ModerationEnforcer
    repository: ModerationRepository
    max_plan_targets: int = 200

    async def simulate_macro(self, request: RunMacroRequest, *, actor_id: str) -> MacroPlan:
        macro = await self._load_macro(request.macro)
        targets = await self._resolve_targets(request.selector)
        plan: list[dict[str, Any]] = []
        for context in targets:
            steps = await self._plan_steps(macro, context, request.variables or {})
            plan.append(
                {
                    "target": context["target"],
                    "steps": steps,
                }
            )
        return MacroPlan(count=len(targets), plan=plan[: self.max_plan_targets])

    async def run_macro(self, request: RunMacroRequest, *, actor_id: str) -> jobs.JobHandle:
        macro = await self._load_macro(request.macro)
        targets = await self._resolve_targets(request.selector)
        selected = self._apply_sampling(targets, request.sample_size)
        dry_run = bool(request.dry_run)
        handle = await self.scheduler.enqueue(
            job_type="macro",
            params={"macro": request.macro, "selector": request.selector.model_dump(mode="json")},
            dry_run=dry_run,
            sample_size=request.sample_size or 0,
            actor_id=actor_id,
        )
        await self.scheduler.mark_running(handle.job_id)
        total = len(selected)
        succeeded = 0
        failed = 0
        plan_for_metadata: list[dict[str, Any]] = []
        for context in selected:
            steps = await self._plan_steps(macro, context, request.variables or {})
            plan_for_metadata.append({"target": context["target"], "steps": steps})
            if dry_run or not steps:
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=context["target"]["type"],
                    target_id=context["target"]["id"],
                    ok=True,
                    error=None,
                    result={"planned_steps": steps},
                )
                succeeded += 1
                continue
            try:
                applied = await self._execute_steps(steps, context, actor_id=actor_id, reason_note=request.reason_note)
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=context["target"]["type"],
                    target_id=context["target"]["id"],
                    ok=True,
                    error=None,
                    result={"applied_steps": applied},
                )
                succeeded += 1
                await self.repository.audit(
                    actor_id,
                    "macro.run.target",
                    context["target"]["type"],
                    context["target"]["id"],
                    {"macro": request.macro, "steps": applied},
                )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=context["target"]["type"],
                    target_id=context["target"]["id"],
                    ok=False,
                    error=str(exc),
                    result=None,
                )
        status = "completed" if failed == 0 else "failed"
        await self.scheduler.finalize(
            handle.job_id,
            status=status,
            total=total,
            succeeded=succeeded,
            failed=failed,
            metadata={"macro": request.macro, "plan_preview": plan_for_metadata[: self.max_plan_targets]},
        )
        if status == "completed":
            await self.repository.audit(
                actor_id,
                "macro.run.completed",
                "macro",
                request.macro,
                {"total": total, "succeeded": succeeded, "dry_run": dry_run},
            )
        else:
            await self.repository.audit(
                actor_id,
                "macro.run.failed",
                "macro",
                request.macro,
                {"total": total, "failed": failed},
            )
        latest = await self.scheduler.status(handle.job_id)
        return latest or handle

    async def run_batch_revert(self, request: BatchRevertRequest, *, actor_id: str) -> jobs.JobHandle:
        targets = await self._resolve_targets(request.selector)
        selected = self._apply_sampling(targets, request.sample_size)
        dry_run = bool(request.dry_run)
        handle = await self.scheduler.enqueue(
            job_type="batch_revert",
            params={"actions": request.actions, "selector": request.selector.model_dump(mode="json")},
            dry_run=dry_run,
            sample_size=request.sample_size or 0,
            actor_id=actor_id,
        )
        await self.scheduler.mark_running(handle.job_id)
        succeeded = 0
        failed = 0
        for context in selected:
            target = context["target"]
            outcome: dict[str, Any] = {"actions": request.actions}
            try:
                if not dry_run:
                    results = []
                    for action in request.actions:
                        results.append(
                            await self.revert_registry.revert(action, {**context, "actor_id": actor_id, "action": action})
                        )
                    outcome["results"] = results
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=target["type"],
                    target_id=target["id"],
                    ok=True,
                    error=None,
                    result=outcome,
                )
                succeeded += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=target["type"],
                    target_id=target["id"],
                    ok=False,
                    error=str(exc),
                    result=None,
                )
        status = "completed" if failed == 0 else "failed"
        await self.scheduler.finalize(
            handle.job_id,
            status=status,
            total=len(selected),
            succeeded=succeeded,
            failed=failed,
            metadata={"actions": request.actions},
        )
        await self.repository.audit(
            actor_id,
            f"batch.revert.{status}",
            "batch_revert",
            handle.job_id,
            {"actions": request.actions, "dry_run": dry_run},
        )
        latest = await self.scheduler.status(handle.job_id)
        return latest or handle

    async def run_batch_unshadow(self, request: BatchUnshadowRequest, *, actor_id: str) -> jobs.JobHandle:
        targets = await self._resolve_targets(request.selector)
        selected = self._apply_sampling(targets, request.sample_size)
        dry_run = bool(request.dry_run)
        handle = await self.scheduler.enqueue(
            job_type="batch_unshadow",
            params={"selector": request.selector.model_dump(mode="json")},
            dry_run=dry_run,
            sample_size=request.sample_size or 0,
            actor_id=actor_id,
        )
        await self.scheduler.mark_running(handle.job_id)
        succeeded = 0
        failed = 0
        for context in selected:
            target = context["target"]
            try:
                if not dry_run:
                    await self.revert_registry.revert(
                        "shadow_hide",
                        {**context, "actor_id": actor_id, "action": "shadow_hide"},
                    )
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=target["type"],
                    target_id=target["id"],
                    ok=True,
                    error=None,
                    result={"unshadowed": not dry_run},
                )
                succeeded += 1
            except Exception as exc:  # noqa: BLE001
                failed += 1
                await self.scheduler.add_item(
                    handle.job_id,
                    target_type=target["type"],
                    target_id=target["id"],
                    ok=False,
                    error=str(exc),
                    result=None,
                )
        status = "completed" if failed == 0 else "failed"
        await self.scheduler.finalize(
            handle.job_id,
            status=status,
            total=len(selected),
            succeeded=succeeded,
            failed=failed,
            metadata={"operation": "unshadow"},
        )
        await self.repository.audit(
            actor_id,
            f"batch.unshadow.{status}",
            "batch_unshadow",
            handle.job_id,
            {"dry_run": dry_run, "targets": len(selected)},
        )
        latest = await self.scheduler.status(handle.job_id)
        return latest or handle

    async def import_bundle(self, request: BundleImportRequest, *, actor_id: str) -> jobs.JobHandle:
        dry_run = bool(request.dry_run)
        handle = await self.scheduler.enqueue(
            job_type="bundle_import",
            params={"enable": request.enable, "dry_run": dry_run},
            dry_run=dry_run,
            sample_size=0,
            actor_id=actor_id,
        )
        await self.scheduler.mark_running(handle.job_id)
        if dry_run:
            result = await self.bundle_service.validate(request.yaml)
            await self.scheduler.finalize(
                handle.job_id,
                status="completed",
                total=result.created + result.updated + result.unchanged,
                succeeded=result.created + result.updated + result.unchanged,
                failed=0,
                metadata=result.__dict__,
            )
            await self.scheduler.add_item(
                handle.job_id,
                target_type="bundle",
                target_id="dry_run",
                ok=True,
                error=None,
                result=result.__dict__,
            )
            latest = await self.scheduler.status(handle.job_id)
            return latest or handle

        outcome = await self.bundle_service.import_bundle(request.yaml, enable=bool(request.enable), actor_id=actor_id)
        await self.scheduler.add_item(
            handle.job_id,
            target_type="bundle",
            target_id="import",
            ok=True,
            error=None,
            result=outcome.__dict__,
        )
        await self.scheduler.finalize(
            handle.job_id,
            status="completed",
            total=outcome.created + outcome.updated + outcome.unchanged,
            succeeded=outcome.created + outcome.updated + outcome.unchanged,
            failed=0,
            metadata=outcome.__dict__,
        )
        await self.repository.audit(
            actor_id,
            "bundle.import.completed",
            "bundle",
            handle.job_id,
            {"enable": bool(request.enable), "result": outcome.__dict__},
        )
        latest = await self.scheduler.status(handle.job_id)
        return latest or handle

    async def _load_macro(self, identifier: str) -> ActionRecord:
        record = await self._load_action(identifier)
        if record.kind != "macro":
            raise ValueError("macro.invalid_kind")
        return record

    async def _load_action(self, identifier: str) -> ActionRecord:
        key, version = self._parse_identifier(identifier)
        if version is not None:
            return await self.catalog.get_action(key=key, version=version)
        records = await self.catalog.list_actions(ActionFilter(key=key, active=True))
        if not records:
            raise KeyError(f"{key}")
        return records[0]

    async def _plan_steps(
        self,
        macro: ActionRecord,
        context: Mapping[str, Any],
        variables: Mapping[str, Any],
    ) -> List[Dict[str, Any]]:
        spec = macro.spec.model_dump(mode="json")
        steps: Sequence[Mapping[str, Any]] = spec.get("steps", [])  # type: ignore[index]
        plan: list[dict[str, Any]] = []
        for step in steps:
            use = step.get("use")
            if not isinstance(use, str):
                continue
            when = step.get("when")
            if isinstance(when, Mapping) and not await self.guard.evaluate(when, context=context):
                continue
            action_record = await self._load_action(use)
            if action_record.kind != "atomic":
                continue
            if not await self._guards_ok(action_record, context):
                continue
            merged_vars = dict(variables)
            if isinstance(step.get("vars"), Mapping):
                merged_vars.update(step["vars"])  # type: ignore[index]
            interpolated = await self.guard.interpolate(merged_vars, context=context)
            payload = self._build_payload(action_record, interpolated)
            plan.append({"use": use, "payload": payload})
        return plan

    async def _guards_ok(self, action_record: ActionRecord, context: Mapping[str, Any]) -> bool:
        spec = action_record.spec.model_dump(mode="json")
        guards_spec: Iterable[Mapping[str, Any]] = spec.get("guards", [])  # type: ignore[index]
        for guard_spec in guards_spec:
            if isinstance(guard_spec, Mapping):
                if not await self.guard.evaluate(guard_spec, context=context):
                    return False
        return True

    def _build_payload(self, action_record: ActionRecord, overrides: Mapping[str, Any]) -> Dict[str, Any]:
        spec = action_record.spec.model_dump(mode="json")
        payload = dict(spec.get("payload", {}))
        payload.update(overrides)
        return payload

    async def _execute_steps(
        self,
        steps: Sequence[Mapping[str, Any]],
        context: Mapping[str, Any],
        *,
        actor_id: str,
        reason_note: Optional[str],
    ) -> List[str]:
        applied: list[str] = []
        target = context["target"]
        case: ModerationCase | None = context.get("case")  # type: ignore[assignment]
        subject_type = str(target["type"])
        subject_id = str(target["id"])
        for step in steps:
            use = str(step.get("use"))
            raw_payload = step.get("payload", {})
            payload: Dict[str, Any] = dict(raw_payload) if isinstance(raw_payload, Mapping) else {}
            action_name = use.split("@", 1)[0]
            ensure_membership_identifiers(
                action_name,
                payload,
                case=case,
                target=context.get("target"),
                subject=context.get("subject"),
            )
            severity = 1
            if "severity" in payload:
                try:
                    severity = int(payload.pop("severity"))
                except (TypeError, ValueError):
                    severity = 1
            decision = Decision(
                action=action_name,
                severity=severity,
                payload=payload,
                reasons=[reason_note or action_name],
            )
            policy_id = case.policy_id if case else None
            await self.enforcer.apply_decision(
                subject_type=subject_type,
                subject_id=subject_id,
                actor_id=actor_id,
                base_reason=reason_note or "macro",
                decision=decision,
                policy_id=policy_id,
            )
            applied.append(action_name)
        return applied

    async def _resolve_targets(self, selector: TargetSelector) -> List[Dict[str, Any]]:
        if selector.kind == "cases":
            return await self._resolve_case_targets(selector.ids or [])
        if selector.kind == "subjects":
            return await self._resolve_subject_targets(selector.subject_type, selector.ids or [])
        raise ValueError("selector.query_not_supported")

    async def _resolve_case_targets(self, case_ids: Sequence[str]) -> List[Dict[str, Any]]:
        contexts: list[dict[str, Any]] = []
        for case_id in case_ids:
            case = await self.repository.get_case(case_id)
            if not case:
                continue
            subject_context = {
                "type": case.subject_type,
                "id": case.subject_id,
                "is_public": True,
            }
            contexts.append(
                {
                    "case": case,
                    "subject": subject_context,
                    "target": {"type": case.subject_type, "id": case.subject_id, "case_id": case.case_id},
                }
            )
        return contexts

    async def _resolve_subject_targets(self, subject_type: Optional[str], subject_ids: Sequence[str]) -> List[Dict[str, Any]]:
        if not subject_type:
            raise ValueError("selector.subject_type_required")
        contexts: list[dict[str, Any]] = []
        for subject_id in subject_ids:
            contexts.append(
                {
                    "case": None,
                    "subject": {"type": subject_type, "id": subject_id, "is_public": True},
                    "target": {"type": subject_type, "id": subject_id},
                }
            )
        return contexts


    def _apply_sampling(self, targets: Sequence[Dict[str, Any]], sample_size: Optional[int]) -> List[Dict[str, Any]]:
        if not sample_size or sample_size <= 0 or sample_size >= len(targets):
            return list(targets)
        return random.sample(list(targets), k=sample_size)

    def _parse_identifier(self, identifier: str) -> Tuple[str, Optional[int]]:
        if "@" not in identifier:
            return identifier, None
        key, version_str = identifier.split("@", 1)
        try:
            return key, int(version_str)
        except ValueError:
            raise ValueError("catalog.version_invalid") from None


def get_admin_tools_executor() -> AdminToolsExecutor:
    """Dependency helper for API routers."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_admin_tools_executor_instance()


__all__ = [
    "AdminToolsExecutor",
    "BatchRevertRequest",
    "BatchUnshadowRequest",
    "BundleImportRequest",
    "MacroPlan",
    "RunMacroRequest",
    "TargetSelector",
    "get_admin_tools_executor",
]
