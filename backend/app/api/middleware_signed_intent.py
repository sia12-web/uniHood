from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, status
from starlette.requests import Request as StarletteRequest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

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


class SignedIntentMiddleware:
    """Pure ASGI middleware for signed intent verification.
    
    This replaces the BaseHTTPMiddleware implementation to avoid the known
    Starlette bug with 'Unexpected message received: http.request' when
    multiple middlewares read the request body.
    """

    def __init__(self, app: ASGIApp, *, protected_paths: tuple[str, ...]) -> None:
        self.app = app
        self.protected = protected_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = StarletteRequest(scope, receive, send)
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
                response = self._error_response(status.HTTP_401_UNAUTHORIZED, "intent_missing")
                await response(scope, receive, send)
                return

            if require_strict and (not x_intent or not x_sig):
                obs_metrics.intent_bad()
                response = self._error_response(status.HTTP_401_UNAUTHORIZED, "intent_missing")
                await response(scope, receive, send)
                return

            # Read body once and cache it
            body = await self._read_body(receive)

            # Create a new receive that returns the cached body
            body_sent = False

            async def cached_receive() -> Message:
                nonlocal body_sent
                if not body_sent:
                    body_sent = True
                    return {"type": "http.request", "body": body, "more_body": False}
                # For disconnect messages
                return {"type": "http.disconnect"}

            # Store body in scope for downstream access
            scope["_body"] = body

            if x_intent and x_sig:
                try:
                    intent_raw = self._decode_intent_raw(x_intent)
                    self._verify_signature(intent_raw, x_sig)
                    intent = self._parse_intent(intent_raw)
                    self._verify_request_match(intent, method, path, body)
                    self._verify_timestamp(intent)
                    await self._verify_nonce(intent)
                    self._store_context(scope, intent, intent_raw)
                    obs_metrics.intent_ok()
                except HTTPException as exc:
                    response = self._error_response(exc.status_code, exc.detail)
                    await response(scope, receive, send)
                    return

            await self.app(scope, cached_receive, send)
        else:
            await self.app(scope, receive, send)

    async def _read_body(self, receive: Receive) -> bytes:
        """Read the entire request body."""
        body_parts: list[bytes] = []
        while True:
            message = await receive()
            body_parts.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        return b"".join(body_parts)

    def _error_response(self, status_code: int, detail: str):
        """Create a JSON error response."""
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=status_code,
            content={"detail": detail},
        )

    def _is_protected(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in self.protected)

    def _decode_intent_raw(self, header: str) -> str:
        try:
            return _b64url_decode(header).decode()
        except Exception as exc:
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
        except (TypeError, ValueError):
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
    def _store_context(scope: Scope, intent: dict[str, Any], raw: str) -> None:
        """Store intent data in scope state for downstream access."""
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["intent"] = intent
        scope["state"]["intent_raw"] = raw
        scope["state"]["intent_nonce"] = intent.get("nonce")
        scope["state"]["intent_ts"] = intent.get("ts")
        scope["state"]["intent_user_id"] = intent.get("user_id")
        scope["state"]["intent_session_id"] = intent.get("session_id")
        scope["state"]["intent_body_sha"] = intent.get("body_sha256")
