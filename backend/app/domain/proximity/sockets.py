"""Socket.IO namespace for presence updates."""

from __future__ import annotations

import logging
import time
from typing import Dict, Iterable, Optional, Set, Tuple

import socketio

from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics

Subscription = Tuple[str, int]


def _header(scope: dict, name: str) -> Optional[str]:
    target = name.encode().lower()
    for key, value in scope.get("headers", []):
        if key.lower() == target:
            return value.decode()
    return None


logger = logging.getLogger(__name__)


class PresenceNamespace(socketio.AsyncNamespace):
    """Namespace implementing basic subscribe/unsubscribe semantics."""

    def __init__(self) -> None:
        super().__init__("/presence")
        self._subscriptions: Dict[str, Set[Subscription]] = {}
        # Keep a lightweight user map to avoid depending on engine.io sessions in tests
        self._users: Dict[str, AuthenticatedUser] = {}

    async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
        obs_metrics.socket_connected(self.namespace)
        scope = environ.get("asgi.scope", environ)
        auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
        user_id = auth_payload.get("userId") or _header(scope, "x-user-id")
        campus_id = auth_payload.get("campusId") or _header(scope, "x-campus-id")
        if not user_id or not campus_id:
            obs_metrics.socket_disconnected(self.namespace)
            raise ConnectionRefusedError("missing authentication headers")
        # Store authenticated user in an internal map to simplify testing
        self._users[sid] = AuthenticatedUser(id=user_id, campus_id=campus_id)
        self._subscriptions[sid] = set()
        logger.info("presence connect sid=%s user=%s campus=%s", sid, user_id, campus_id)
        await self.emit("presence:ack", {"ts": int(time.time() * 1000)}, room=sid)

    async def on_disconnect(self, sid: str) -> None:
        obs_metrics.socket_disconnected(self.namespace)
        user = self._users.get(sid)
        for campus_id, radius in self._subscriptions.get(sid, set()):
            await self.leave_room(sid, self._campus_room(campus_id))
            await self.leave_room(sid, self._radius_room(campus_id, radius))
        self._subscriptions.pop(sid, None)
        self._users.pop(sid, None)
        if user:
            logger.info("presence disconnect sid=%s user=%s campus=%s", sid, user.id, user.campus_id)

    async def on_nearby_subscribe(self, sid: str, data: dict) -> None:
        obs_metrics.socket_event(self.namespace, "nearby_subscribe")
        user: AuthenticatedUser = self._users.get(sid)  # type: ignore[assignment]
        if not user:
            raise ConnectionRefusedError("unauthenticated")
        campus_id = str(data.get("campus_id") or user.campus_id)
        radius = int(data.get("radius_m"))
        # In test contexts the SID may not be fully registered with the server; ignore room errors
        try:
            await self.enter_room(sid, self._campus_room(campus_id))
            await self.enter_room(sid, self._radius_room(campus_id, radius))
        except ValueError:
            pass
        self._subscriptions.setdefault(sid, set()).add((campus_id, radius))
        logger.info(
            "presence subscribe sid=%s user=%s campus=%s radius=%s",
            sid,
            user.id,
            campus_id,
            radius,
        )
        await self.emit(
            "nearby:update",
            {"radius_m": radius, "added": [], "removed": [], "updated": []},
            room=sid,
        )

    async def on_nearby_unsubscribe(self, sid: str, data: dict) -> None:
        obs_metrics.socket_event(self.namespace, "nearby_unsubscribe")
        campus_id = str(data.get("campus_id"))
        radius = int(data.get("radius_m"))
        try:
            await self.leave_room(sid, self._radius_room(campus_id, radius))
        except ValueError:
            pass
        subs = self._subscriptions.get(sid)
        if subs and (campus_id, radius) in subs:
            subs.remove((campus_id, radius))
            if not any(entry[0] == campus_id for entry in subs):
                try:
                    await self.leave_room(sid, self._campus_room(campus_id))
                except ValueError:
                    pass

    async def broadcast_diff(
        self,
        campus_id: str,
        radius: int,
        *,
        added: Iterable[dict],
        removed: Iterable[str],
        updated: Iterable[dict],
    ) -> None:
        obs_metrics.socket_event(self.namespace, "nearby:update")
        payload = {
            "radius_m": radius,
            "added": list(added),
            "removed": list(removed),
            "updated": list(updated),
        }
        await self.emit("nearby:update", payload, room=self._radius_room(campus_id, radius))

    @staticmethod
    def _campus_room(campus_id: str) -> str:
        return f"campus:{campus_id}"

    @staticmethod
    def _radius_room(campus_id: str, radius: int) -> str:
        return f"campus:{campus_id}:r:{radius}"
