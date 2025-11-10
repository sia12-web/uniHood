from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics
from app.settings import settings


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _intent_key(nonce: str) -> str:
    return f"intent:nonce:{nonce}"


class SignedIntentMiddleware(BaseHTTPMiddleware):  # type: ignore[misc]
    def __init__(self, app: ASGIApp, *, protected_paths: tuple[str, ...]) -> None:
        super().__init__(app)
        self.protected = protected_paths

    async def dispatch(self, request, call_next):  # type: ignore[override]
        path = request.url.path
        method = request.method.upper()
        require_strict = settings.intent_signing_required and settings.environment.lower() not in {
            "dev",
            "development",
            "test",
            "testing",
        }
        if method in {"POST", "PUT", "PATCH", "DELETE"} and self._is_protected(path):
            x_intent = request.headers.get("X-Intent")
            x_sig = request.headers.get("X-Signature")
            if (x_intent and not x_sig) or (x_sig and not x_intent):
                obs_metrics.intent_bad()
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="intent_missing")
            if require_strict and (not x_intent or not x_sig):
                obs_metrics.intent_bad()
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="intent_missing")

            body = await request.body()

            async def receive() -> dict[str, Any]:
                return {"type": "http.request", "body": body, "more_body": False}

            request._receive = receive  # type: ignore[attr-defined]
            request._body = body  # type: ignore[attr-defined]

            if x_intent and x_sig:
                intent_raw = self._decode_intent_raw(x_intent)
                self._verify_signature(intent_raw, x_sig)
                intent = self._parse_intent(intent_raw)
                self._verify_request_match(intent, method, path, body)
                self._verify_timestamp(intent)
                await self._verify_nonce(intent)
                self._store_context(request, intent, intent_raw)
                obs_metrics.intent_ok()
        return await call_next(request)

    def _is_protected(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in self.protected)

    def _decode_intent_raw(self, header: str) -> str:
        try:
            return _b64url_decode(header).decode()
        except Exception as exc:  # pragma: no cover - defensive
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="intent_bad_format") from exc

    def _verify_signature(self, intent_raw: str, signature: str) -> None:
        expected = hmac.new(
            settings.service_signing_key.encode(),
            intent_raw.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="intent_bad_sig")

    def _parse_intent(self, intent_raw: str) -> dict[str, Any]:
        try:
            return json.loads(intent_raw)
        except json.JSONDecodeError as exc:
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="intent_bad_format") from exc

    def _verify_request_match(self, intent: dict[str, Any], method: str, path: str, body: bytes) -> None:
        if str(intent.get("method")) != method or str(intent.get("path")) != path:
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="intent_mismatch")
        body_sha = intent.get("body_sha256")
        if body_sha:
            actual = _sha256_hex(body or b"")
            if body_sha != actual:
                obs_metrics.intent_bad()
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="intent_mismatch")

    def _verify_timestamp(self, intent: dict[str, Any]) -> None:
        try:
            ts = int(intent.get("ts", 0))
        except (TypeError, ValueError):  # pragma: no cover - invalid payload
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="intent_mismatch")
        now = int(time.time())
        if abs(now - ts) > int(settings.intent_allowed_skew_seconds):
            obs_metrics.intent_bad()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="intent_stale")

    async def _verify_nonce(self, intent: dict[str, Any]) -> None:
        nonce = str(intent.get("nonce") or "").strip()
        if not nonce:
            return
        key = _intent_key(nonce)
        ttl = int(settings.intent_nonce_ttl_seconds)
        ok = await redis_client.set(key, "1", ex=ttl, nx=True)
        if not ok:
            obs_metrics.intent_replay()
            raise HTTPException(status.HTTP_409_CONFLICT, detail="intent_replay")

    @staticmethod
    def _store_context(request: Request, intent: dict[str, Any], raw: str) -> None:
        setattr(request.state, "intent", intent)
        setattr(request.state, "intent_raw", raw)
        setattr(request.state, "intent_nonce", intent.get("nonce"))
        setattr(request.state, "intent_ts", intent.get("ts"))
        setattr(request.state, "intent_user_id", intent.get("user_id"))
        setattr(request.state, "intent_session_id", intent.get("session_id"))
        setattr(request.state, "intent_body_sha", intent.get("body_sha256"))
