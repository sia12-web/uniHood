"""Actions catalog service implementation for moderation admin tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

import asyncpg
from pydantic import BaseModel, Field

from app.moderation.domain.enforcement import ModerationRepository

ActionKind = Literal["atomic", "macro"]


class ActionSpec(BaseModel):
    """Opaque JSON payload describing an atomic action or macro."""

    model_config = {"extra": "allow"}


class ActionRecord(BaseModel):
    """Normalized catalog entry response."""

    key: str
    version: int
    kind: ActionKind
    spec: ActionSpec
    is_active: bool = True


class ActionCreateRequest(BaseModel):
    """Payload for creating a new catalog entry."""

    key: str = Field(..., min_length=1)
    kind: ActionKind
    spec: ActionSpec
    version: Optional[int] = None
    activate: bool = True


class ActionFilter(BaseModel):
    """Filter parameters for catalog listing."""

    key: Optional[str] = None
    kind: Optional[ActionKind] = None
    active: Optional[bool] = None


@dataclass(slots=True)
class ActionsCatalogService:
    """Facade for catalog CRUD operations backed by PostgreSQL."""

    pool: asyncpg.Pool
    audit_repo: ModerationRepository

    async def list_actions(self, filters: ActionFilter) -> List[ActionRecord]:
        clauses: list[str] = []
        params: list[object] = []
        if filters.key is not None:
            params.append(filters.key)
            clauses.append(f"key = ${len(params)}")
        if filters.kind is not None:
            params.append(filters.kind)
            clauses.append(f"kind = ${len(params)}")
        if filters.active is not None:
            params.append(filters.active)
            clauses.append(f"is_active = ${len(params)}")
        where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        query = f"""
            SELECT key, version, kind, spec, is_active
            FROM mod_action_catalog
            {where_clause}
            ORDER BY key ASC, version DESC
        """
        records = await self.pool.fetch(query, *params)
        return [self._record_from_row(record) for record in records]

    async def create_action(self, payload: ActionCreateRequest, *, actor_id: str) -> ActionRecord:
        if not actor_id:
            raise ValueError("catalog.actor_required")
        if payload.version is not None and payload.version <= 0:
            raise ValueError("catalog.version_invalid")
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                version = payload.version
                if version is None:
                    next_version = await conn.fetchval(
                        "SELECT COALESCE(MAX(version), 0) + 1 FROM mod_action_catalog WHERE key = $1",
                        payload.key,
                    )
                    version = int(next_version or 1)
                else:
                    exists = await conn.fetchval(
                        "SELECT 1 FROM mod_action_catalog WHERE key = $1 AND version = $2",
                        payload.key,
                        version,
                    )
                    if exists:
                        raise ValueError("catalog.version_exists")
                record = await conn.fetchrow(
                    """
                    INSERT INTO mod_action_catalog (key, version, kind, spec, is_active, created_by)
                    VALUES ($1, $2, $3, $4::jsonb, $5, $6)
                    RETURNING key, version, kind, spec, is_active
                    """,
                    payload.key,
                    version,
                    payload.kind,
                    payload.spec.model_dump(mode="json"),
                    payload.activate,
                    actor_id,
                )
                assert record is not None
            action = self._record_from_row(record)
        await self.audit_repo.audit(
            actor_id,
            "catalog.action.create",
            "mod_action_catalog",
            f"{action.key}@{action.version}",
            {"kind": action.kind, "is_active": action.is_active},
        )
        return action

    async def get_action(self, *, key: str, version: int) -> ActionRecord:
        record = await self.pool.fetchrow(
            """
            SELECT key, version, kind, spec, is_active
            FROM mod_action_catalog
            WHERE key = $1 AND version = $2
            """,
            key,
            version,
        )
        if record is None:
            raise KeyError(f"{key}@{version}")
        return self._record_from_row(record)

    async def deactivate_action(self, *, key: str, version: int, actor_id: str) -> ActionRecord:
        if not actor_id:
            raise ValueError("catalog.actor_required")
        record = await self.pool.fetchrow(
            """
            UPDATE mod_action_catalog
            SET is_active = FALSE
            WHERE key = $1 AND version = $2
            RETURNING key, version, kind, spec, is_active
            """,
            key,
            version,
        )
        if record is None:
            raise KeyError(f"{key}@{version}")
        action = self._record_from_row(record)
        await self.audit_repo.audit(
            actor_id,
            "catalog.action.deactivate",
            "mod_action_catalog",
            f"{action.key}@{action.version}",
            {"is_active": action.is_active},
        )
        return action

    @staticmethod
    def _record_from_row(record: asyncpg.Record) -> ActionRecord:
        spec_payload = record["spec"]
        if spec_payload is None:
            spec_model = ActionSpec()
        elif isinstance(spec_payload, str):
            spec_model = ActionSpec.model_validate_json(spec_payload)
        else:
            spec_model = ActionSpec.model_validate(spec_payload)
        return ActionRecord(
            key=str(record["key"]),
            version=int(record["version"]),
            kind=str(record["kind"]),
            spec=spec_model,
            is_active=bool(record["is_active"]),
        )


def get_actions_catalog_service() -> ActionsCatalogService:
    """Dependency shim for FastAPI routers."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_actions_catalog_service_instance()


__all__ = [
    "ActionSpec",
    "ActionRecord",
    "ActionCreateRequest",
    "ActionFilter",
    "ActionsCatalogService",
    "get_actions_catalog_service",
]
