"""Socket.IO namespace for XP system."""

from __future__ import annotations

from typing import Dict, Optional

import socketio
from uuid import UUID

from app.settings import settings

_namespace: "XPNamespace" | None = None

class XPNamespace(socketio.AsyncNamespace):
    """Namespace for XP events."""

    def __init__(self) -> None:
        super().__init__("/xp")
        # Map socket_id to user_id for quick lookup if needed
        self._users: Dict[str, str] = {}

    async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
        try:
            user_id = self._get_user_id(environ, auth)
        except Exception:
            raise ConnectionRefusedError("unauthorized")
        
        self._users[sid] = user_id
        await self.enter_room(sid, self.user_room(user_id))

    async def on_disconnect(self, sid: str) -> None:
        user_id = self._users.pop(sid, None)
        if user_id:
            await self.leave_room(sid, self.user_room(user_id))

    def _get_user_id(self, environ: dict, auth: Optional[dict]) -> str:
        # Simplified auth extraction similar to ChatNamespace but focused on ID
        scope = environ.get("asgi.scope", environ)
        auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
        
        user_id = auth_payload.get("userId") or auth_payload.get("user_id")
        
        if not user_id:
            # Fallback for dev mode without auth payload if strictly needed, 
            # but usually frontend sends it.
            if settings.is_dev():
                 # Try query params or headers if needed, but for now strict
                 pass
            raise ValueError("missing_user_id")
            
        return str(user_id)

    @staticmethod
    def user_room(user_id: str) -> str:
        return f"user:{user_id}"


def set_namespace(namespace: XPNamespace) -> None:
    global _namespace
    _namespace = namespace


async def emit_xp_gained(user_id: str | UUID, amount: int, action: str, new_total: int, new_level: int) -> None:
    if _namespace is None:
        return
    
    uid = str(user_id)
    payload = {
        "amount": amount,
        "action": action,
        "total_xp": new_total,
        "level": new_level
    }
    await _namespace.emit("xp:gained", payload, room=XPNamespace.user_room(uid))


async def emit_level_up(user_id: str | UUID, new_level: int) -> None:
    if _namespace is None:
        return
    
    uid = str(user_id)
    payload = {
        "level": new_level
    }
    await _namespace.emit("xp:levelup", payload, room=XPNamespace.user_room(uid))
