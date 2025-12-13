from __future__ import annotations

import uuid

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class IdempotencyMiddleware:
    """Attach an idempotency key to every HTTP request/response pair.

    Implemented as a raw ASGI middleware to avoid the Starlette BaseHTTPMiddleware
    caveat where exceptions can surface as "No response returned" if the downstream
    app fails before producing a response. By writing headers in the ASGI `send`
    hook we guarantee the key is attached to normal and error responses alike and
    we bypass websocket scopes entirely.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        key = request.headers.get("Idempotency-Key") or str(uuid.uuid4())
        request.state.idem_key = key

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(raw=message.get("headers", []))
                headers.append("Idempotency-Key", key)
                message["headers"] = headers.raw
            await send(message)

        await self.app(scope, receive, send_with_header)
