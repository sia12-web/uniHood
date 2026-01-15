"""Bundle import/export helpers for moderator actions catalog."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, List, Mapping, Optional, Sequence

import yaml

from .catalog import ActionCreateRequest, ActionFilter, ActionRecord, ActionSpec, ActionsCatalogService


@dataclass(slots=True)
class BundleExportResult:
    """Represents a serialized bundle response."""

    yaml: str
    signature: Optional[str] = None


@dataclass(slots=True)
class BundleImportResult:
    """Represents the outcome of a bundle import."""

    created: int = 0
    updated: int = 0
    unchanged: int = 0


@dataclass(slots=True)
class BundleService:
    """Handles YAML serialization and validation."""

    catalog: ActionsCatalogService
    signing_secret: Optional[str] = None
    org_slug: str = "divan"

    async def export(self, keys: List[str]) -> BundleExportResult:
        actions = await self._collect_actions(keys)
        payload = {
            "org": self.org_slug,
            "version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "actions": [
                {
                    "key": action.key,
                    "version": action.version,
                    "kind": action.kind,
                    "spec": action.spec.model_dump(mode="json"),
                    "is_active": action.is_active,
                }
                for action in actions
            ],
        }
        yaml_text = yaml.safe_dump(payload, sort_keys=False)
        signature = None
        if self.signing_secret:
            signature = hmac.new(
                self.signing_secret.encode("utf-8"),
                yaml_text.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
        return BundleExportResult(yaml=yaml_text, signature=signature)

    async def validate(self, yaml_text: str) -> BundleImportResult:
        bundle = _parse_bundle(yaml_text)
        actions = bundle.get("actions", [])
        if not isinstance(actions, list):
            raise ValueError("bundle.actions_invalid")
        result = BundleImportResult()
        for entry in actions:
            key = str(entry.get("key", ""))
            if not key:
                raise ValueError("bundle.key_missing")
            existing = await self._latest_action(key)
            spec = entry.get("spec", {})
            version = entry.get("version")
            if existing is None:
                result.created += 1
                continue
            if version and version == existing.version and _spec_equal(existing.spec, spec):
                result.unchanged += 1
            else:
                result.updated += 1
        return result

    async def import_bundle(self, yaml_text: str, *, enable: bool, actor_id: str) -> BundleImportResult:
        bundle = _parse_bundle(yaml_text)
        actions = bundle.get("actions", [])
        if not isinstance(actions, list):
            raise ValueError("bundle.actions_invalid")
        result = BundleImportResult()
        for entry in actions:
            key = str(entry.get("key", ""))
            kind = entry.get("kind", "atomic")
            spec = entry.get("spec", {})
            if not key or kind not in {"atomic", "macro"}:
                raise ValueError("bundle.entry_invalid")
            version = entry.get("version")
            existing = await self._latest_action(key)
            if existing is None:
                await self.catalog.create_action(
                    ActionCreateRequest(key=key, kind=kind, spec=ActionSpec.model_validate(spec), version=version, activate=enable),
                    actor_id=actor_id,
                )
                result.created += 1
                continue
            if version and version == existing.version and _spec_equal(existing.spec, spec):
                result.unchanged += 1
                continue
            next_version = (existing.version + 1) if version is None else max(existing.version + 1, int(version))
            await self.catalog.create_action(
                ActionCreateRequest(key=key, kind=kind, spec=ActionSpec.model_validate(spec), version=next_version, activate=enable),
                actor_id=actor_id,
            )
            result.updated += 1
        return result

    async def _collect_actions(self, keys: Sequence[str]) -> List[ActionRecord]:
        if not keys:
            return await self.catalog.list_actions(ActionFilter(active=None))
        collected: List[ActionRecord] = []
        for key in keys:
            actions = await self.catalog.list_actions(ActionFilter(key=key))
            collected.extend(actions)
        collected.sort(key=lambda record: (record.key, record.version))
        return collected

    async def _latest_action(self, key: str) -> ActionRecord | None:
        records = await self.catalog.list_actions(ActionFilter(key=key))
        return records[0] if records else None


def get_bundle_service() -> BundleService:
    """Dependency provider for bundle operations."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_bundle_service_instance()


__all__ = [
    "BundleExportResult",
    "BundleImportResult",
    "BundleService",
    "get_bundle_service",
]


def _parse_bundle(yaml_text: str) -> Mapping[str, Any]:
    try:
        bundle = yaml.safe_load(yaml_text) or {}
    except yaml.YAMLError as exc:  # pragma: no cover - parse errors bubble up
        raise ValueError("bundle.invalid_yaml") from exc
    if not isinstance(bundle, Mapping):
        raise ValueError("bundle.invalid_format")
    return bundle


def _spec_equal(existing: ActionSpec, incoming: Mapping[str, Any]) -> bool:
    try:
        current = existing.model_dump(mode="json")
    except Exception:  # pragma: no cover - defensive
        current = {}
    return current == incoming
