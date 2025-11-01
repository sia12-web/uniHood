"""Guard predicate helpers for moderator macros."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, MutableMapping


class _SafeFormatDict(dict):
    def __missing__(self, key: str) -> str:  # pragma: no cover - defensive
        return "{" + key + "}"


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _flatten(prefix: str, value: Any, out: MutableMapping[str, Any]) -> None:
    key_prefix = f"{prefix}." if prefix else ""
    if isinstance(value, Mapping):
        for key, inner in value.items():
            _flatten(f"{key_prefix}{key}", inner, out)
        return
    if hasattr(value, "__dict__") and not isinstance(value, (str, bytes)):
        data = {k: getattr(value, k) for k in vars(value)}
        for key, inner in data.items():
            _flatten(f"{key_prefix}{key}", inner, out)
        return
    out[prefix] = value


def _resolve_path(context: Mapping[str, Any], path: str) -> Any:
    parts = path.split(".")
    current: Any = context
    for part in parts:
        if isinstance(current, Mapping):
            current = current.get(part)
        elif hasattr(current, part):
            current = getattr(current, part)
        else:
            return None
    return current


@dataclass(slots=True)
class GuardEvaluator:
    """Evaluates guard predicates against a target context."""

    async def evaluate(self, guard: Mapping[str, Any], *, context: Mapping[str, Any]) -> bool:
        if not guard:
            return True
        predicate = str(guard.get("pred", "")).lower()
        args = guard.get("args", [])
        if predicate in {"", "always"}:
            return True
        if predicate == "not":
            expr = guard.get("expr")
            if not isinstance(expr, Mapping):
                return False
            return not await self.evaluate(expr, context=context)
        if predicate == "user.band_in":
            bands = set(_resolve_path(context, "user.bands") or [])
            return any(str(arg) in bands for arg in args)
        if predicate == "case.status_in":
            status = str(_resolve_path(context, "case.status") or "")
            return status in {str(arg) for arg in args}
        if predicate == "subject.is_public":
            is_public = _resolve_path(context, "subject.is_public")
            if is_public is None:
                is_private = _resolve_path(context, "subject.is_private")
                return not bool(is_private)
            return bool(is_public)
        if predicate == "subject.shadowed":
            return bool(_resolve_path(context, "subject.shadowed"))
        if predicate == "subject.created_within":
            if not args:
                return False
            try:
                hours = float(args[0])
            except (TypeError, ValueError):
                return False
            created_at = _coerce_datetime(_resolve_path(context, "subject.created_at"))
            if created_at is None:
                return False
            return created_at >= datetime.now(timezone.utc) - timedelta(hours=hours)
        if predicate == "subject.type_in":
            subject_type = str(_resolve_path(context, "subject.type") or "")
            return subject_type in {str(arg) for arg in args}
        return False

    async def interpolate(self, variables: Mapping[str, Any], *, context: Mapping[str, Any]) -> Mapping[str, Any]:
        if not variables:
            return {}
        flattened: dict[str, Any] = {}
        _flatten("", context, flattened)
        safe_context = _SafeFormatDict(flattened)

        def _apply(value: Any) -> Any:
            if isinstance(value, str):
                return value.format_map(safe_context)
            if isinstance(value, Mapping):
                return {key: _apply(inner) for key, inner in value.items()}
            if isinstance(value, list):
                return [_apply(item) for item in value]
            return value

        return {key: _apply(val) for key, val in variables.items()}


def get_guard_evaluator() -> GuardEvaluator:
    """Dependency provider for guard evaluation."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_guard_evaluator_instance()


__all__ = ["GuardEvaluator", "get_guard_evaluator"]
