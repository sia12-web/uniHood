"""Unit tests for the moderation actions catalog service."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import pytest

from app.moderation.domain.tools import (
    ActionCreateRequest,
    ActionFilter,
    ActionsCatalogService,
)


class FakePool:
    """Lightweight asyncpg.Pool stand-in for unit tests."""

    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []

    async def fetch(self, query: str, *params: object) -> list[dict[str, Any]]:
        results = [dict(record) for record in self.records]
        if "WHERE" in query and params:
            clause_section = query.split("WHERE", 1)[1].split("ORDER", 1)[0]
            clauses = [clause.strip() for clause in clause_section.split("AND") if clause.strip()]
            for index, clause in enumerate(clauses):
                value = params[index]
                if "key" in clause:
                    results = [r for r in results if r["key"] == value]
                elif "kind" in clause:
                    results = [r for r in results if r["kind"] == value]
                elif "is_active" in clause:
                    results = [r for r in results if r["is_active"] == value]
        results.sort(key=lambda record: (record["key"], -record["version"]))
        return results

    async def fetchrow(self, query: str, *params: object) -> dict[str, Any] | None:
        if "UPDATE mod_action_catalog" in query:
            key, version = params
            for record in self.records:
                if record["key"] == key and record["version"] == version:
                    record["is_active"] = False
                    return dict(record)
            return None
        if "SELECT key" in query:
            key, version = params
            for record in self.records:
                if record["key"] == key and record["version"] == version:
                    return dict(record)
            return None
        raise NotImplementedError(query)

    async def fetchval(self, query: str, *params: object) -> Any:
        if "COALESCE(MAX(version)" in query:
            key = params[0]
            versions = [record["version"] for record in self.records if record["key"] == key]
            return (max(versions) + 1) if versions else 1
        if "SELECT 1 FROM mod_action_catalog" in query:
            key, version = params
            return 1 if any(record["key"] == key and record["version"] == version for record in self.records) else None
        raise NotImplementedError(query)

    @asynccontextmanager
    async def acquire(self) -> FakeConnection:
        connection = FakeConnection(self)
        yield connection


class FakeConnection:
    def __init__(self, pool: FakePool) -> None:
        self._pool = pool

    def transaction(self):  # type: ignore[override]
        @asynccontextmanager
        async def _transaction():
            yield

        return _transaction()

    async def fetchval(self, query: str, *params: object) -> Any:
        return await self._pool.fetchval(query, *params)

    async def fetchrow(self, query: str, *params: object) -> dict[str, Any] | None:
        if "INSERT INTO mod_action_catalog" in query:
            key, version, kind, spec, is_active, created_by = params
            record = {
                "key": key,
                "version": int(version),
                "kind": kind,
                "spec": spec,
                "is_active": bool(is_active),
                "created_by": created_by,
            }
            self._pool.records.append(record)
            return dict(record)
        return await self._pool.fetchrow(query, *params)


@dataclass
class AuditStub:
    calls: list[tuple[str | None, str, str, str, dict[str, Any]]]

    async def audit(
        self,
        actor_id: str | None,
        action: str,
        target_type: str,
        target_id: str,
        meta: dict[str, Any],
    ) -> None:
        self.calls.append((actor_id, action, target_type, target_id, dict(meta)))


@pytest.mark.asyncio
async def test_create_action_auto_version_and_audit() -> None:
    pool = FakePool()
    audit = AuditStub(calls=[])
    service = ActionsCatalogService(pool=pool, audit_repo=audit)  # type: ignore[arg-type]

    first = await service.create_action(
        ActionCreateRequest(key="warn", kind="atomic", spec={"action": "warn"}),
        actor_id="admin-1",
    )
    second = await service.create_action(
        ActionCreateRequest(key="warn", kind="atomic", spec={"action": "warn"}),
        actor_id="admin-1",
    )

    assert first.version == 1
    assert second.version == 2
    assert len(pool.records) == 2
    assert [call[1] for call in audit.calls] == ["catalog.action.create", "catalog.action.create"]


@pytest.mark.asyncio
async def test_create_action_duplicate_version_raises() -> None:
    pool = FakePool()
    audit = AuditStub(calls=[])
    service = ActionsCatalogService(pool=pool, audit_repo=audit)  # type: ignore[arg-type]

    await service.create_action(
        ActionCreateRequest(key="mute", kind="atomic", version=5, spec={"action": "mute"}),
        actor_id="staff",
    )

    with pytest.raises(ValueError):
        await service.create_action(
            ActionCreateRequest(key="mute", kind="atomic", version=5, spec={"action": "mute"}),
            actor_id="staff",
        )


@pytest.mark.asyncio
async def test_get_action_and_deactivate_flow() -> None:
    pool = FakePool()
    audit = AuditStub(calls=[])
    service = ActionsCatalogService(pool=pool, audit_repo=audit)  # type: ignore[arg-type]

    created = await service.create_action(
        ActionCreateRequest(key="shadow_hide", kind="atomic", spec={"action": "shadow_hide"}),
        actor_id="operator",
    )

    fetched = await service.get_action(key=created.key, version=created.version)
    assert fetched.key == created.key
    assert fetched.is_active is True

    deactivated = await service.deactivate_action(key=created.key, version=created.version, actor_id="operator")
    assert deactivated.is_active is False
    assert audit.calls[-1][1] == "catalog.action.deactivate"

    with pytest.raises(KeyError):
        await service.get_action(key="missing", version=1)


@pytest.mark.asyncio
async def test_list_actions_filters() -> None:
    pool = FakePool()
    audit = AuditStub(calls=[])
    service = ActionsCatalogService(pool=pool, audit_repo=audit)  # type: ignore[arg-type]

    await service.create_action(
        ActionCreateRequest(key="warn", kind="atomic", spec={"action": "warn"}),
        actor_id="staff",
    )
    await service.create_action(
        ActionCreateRequest(key="spam_sweep", kind="macro", spec={"steps": []}, activate=False),
        actor_id="staff",
    )

    all_actions = await service.list_actions(ActionFilter())
    assert len(all_actions) == 2

    macros = await service.list_actions(ActionFilter(kind="macro"))
    assert [action.key for action in macros] == ["spam_sweep"]

    active_only = await service.list_actions(ActionFilter(active=True))
    assert [action.key for action in active_only] == ["warn"]

    filtered = await service.list_actions(ActionFilter(key="warn"))
    assert len(filtered) == 1
    assert filtered[0].key == "warn"