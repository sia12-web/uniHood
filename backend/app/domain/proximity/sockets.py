"""Socket.IO namespace for presence updates."""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Dict, Optional, Tuple

import socketio

from app.infra.auth import _parse_token as parse_access_token
from app.infra.rate_limit import allow as rate_allow
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics
from app.settings import settings

logger = logging.getLogger(__name__)

KEEPALIVE_EX = max(1, int(settings.presence_keepalive_idle_seconds))
BACKPRESSURE_THRESHOLD = 200
RECONNECT_GRACE_SECONDS = 30
DEFAULT_NEARBY_LIMIT = 20


def _header(scope: dict, name: str) -> Optional[str]:
    target = name.encode().lower()
    for key, value in scope.get("headers", []):
        if key.lower() == target:
            return value.decode()
    return None


def _presence_key(user_id: str) -> str:
    return f"presence:{user_id}"


def _campus_geo_key(campus_id: str) -> str:
    return f"presence:campus:{campus_id}"


def _effective_radius(raw: object) -> int:
    try:
        radius = int(raw)
    except (TypeError, ValueError):
        radius = 0
    if radius <= 10:
        floor = int(settings.proximity_min_search_radius_10m)
        return floor if radius <= 0 else max(radius, floor)
    return radius


async def _set_presence(
    user_id: str,
    campus_id: str,
    *,
    lat: float,
    lon: float,
    radius_m: int,
    session_id: str,
    handle: Optional[str],
) -> None:
    key = _presence_key(user_id)
    mapping = {
        "lat": str(lat),
        "lon": str(lon),
        "campus_id": str(campus_id),
        "radius_m": str(int(radius_m)),
        "status": "live",
        "updated_at": str(int(time.time())),
        "session_id": str(session_id),
    }
    if handle:
        mapping["handle"] = str(handle)
    await redis_client.hset(key, mapping=mapping)
    await redis_client.expire(key, KEEPALIVE_EX)
    await redis_client.geoadd(_campus_geo_key(campus_id), {str(user_id): (float(lon), float(lat))})
    await _update_online_gauge(campus_id)


def _encode_cursor(dist: float, member: str) -> str:
    payload = json.dumps({"dist": dist, "id": member}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_cursor(raw: Optional[str]) -> Optional[Tuple[float, str]]:
    if not raw:
        return None
    try:
        padding = "=" * (-len(raw) % 4)
        decoded = base64.urlsafe_b64decode(raw + padding)
        payload = json.loads(decoded.decode())
        dist = float(payload["dist"])
        member = str(payload["id"])
        return dist, member
    except Exception:
        return None


async def _update_online_gauge(campus_id: str) -> None:
    count = await redis_client.zcard(_campus_geo_key(campus_id))
    obs_metrics.PRESENCE_ONLINE.labels(campus_id=str(campus_id)).set(float(count))


class PresenceNamespace(socketio.AsyncNamespace):
    def __init__(self) -> None:
        super().__init__("/presence")
        self.users: Dict[str, Dict[str, Optional[str]]] = {}

    async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
        obs_metrics.socket_connected(self.namespace)
        try:
            ctx = await self._authorise(environ, auth)
        except Exception:
            obs_metrics.socket_disconnected(self.namespace)
            raise ConnectionRefusedError("unauthorized") from None
        self.users[sid] = ctx
        try:
            await self.enter_room(sid, self._user_room(ctx["user_id"]))
            await self.enter_room(sid, self._campus_room(ctx["campus_id"]))
        except ValueError:
            logger.debug("presence connect room attach failed sid=%s", sid, exc_info=True)
        logger.info(
            "presence connect sid=%s user=%s campus=%s",
            sid,
            ctx["user_id"],
            ctx["campus_id"],
        )
        await self.emit("sys.ok", {"me": {"id": ctx["user_id"], "campus_id": ctx["campus_id"]}}, room=sid)
        await self._emit_resume_snapshot(sid, ctx)

    async def on_disconnect(self, sid: str) -> None:
        obs_metrics.socket_disconnected(self.namespace)
        ctx = self.users.pop(sid, None)
        if not ctx:
            return
        for room in (self._user_room(ctx["user_id"]), self._campus_room(ctx["campus_id"])):
            try:
                await self.leave_room(sid, room)
            except ValueError:
                pass
        logger.info(
            "presence disconnect sid=%s user=%s campus=%s",
            sid,
            ctx["user_id"],
            ctx["campus_id"],
        )

    async def on_presence_go_live(self, sid: str, data: dict) -> None:
        obs_metrics.socket_event(self.namespace, "presence_go_live")
        ctx = self.users.get(sid)
        if not ctx:
            await self._warn_rate_limited(sid)  # reuse warn path for unauthorized
            return
        try:
            lat = float(data.get("lat"))
            lon = float(data.get("lon"))
        except (TypeError, ValueError):
            await self.emit("sys.warn", {"code": "invalid_payload"}, room=sid)
            return
        radius = _effective_radius(data.get("radius_m"))
        await _set_presence(
            ctx["user_id"],
            ctx["campus_id"],
            lat=lat,
            lon=lon,
            radius_m=radius,
            session_id=str(ctx["session_id"]),
            handle=ctx.get("handle"),
        )
        await self.emit("presence.ack", {"ok": True}, room=sid)

    async def on_presence_update(self, sid: str, data: dict) -> None:
        obs_metrics.socket_event(self.namespace, "presence_update")
        ctx = self.users.get(sid)
        if not ctx:
            await self._warn_rate_limited(sid)
            return
        if not await self._check_limits("presence_update", ctx["user_id"], sid, limit=10, window=10):
            return
        try:
            lat = float(data.get("lat"))
            lon = float(data.get("lon"))
        except (TypeError, ValueError):
            await self.emit("sys.warn", {"code": "invalid_payload"}, room=sid)
            return
        radius = _effective_radius(data.get("radius_m"))
        await _set_presence(
            ctx["user_id"],
            ctx["campus_id"],
            lat=lat,
            lon=lon,
            radius_m=radius,
            session_id=str(ctx["session_id"]),
            handle=ctx.get("handle"),
        )
        await self.emit("presence.ack", {"ok": True}, room=sid)

    async def on_presence_go_ghost(self, sid: str) -> None:
        obs_metrics.socket_event(self.namespace, "presence_go_ghost")
        ctx = self.users.get(sid)
        if not ctx:
            return
        key = _presence_key(ctx["user_id"])
        await redis_client.delete(key)
        await redis_client.zrem(_campus_geo_key(ctx["campus_id"]), ctx["user_id"])
        await _update_online_gauge(str(ctx["campus_id"]))
        await self.emit("presence.ack", {"ok": True}, room=sid)

    async def on_hb(self, sid: str) -> None:
        ctx = self.users.get(sid)
        if not ctx:
            return
        key = _presence_key(ctx["user_id"])
        await redis_client.hset(key, mapping={"updated_at": str(int(time.time()))})
        await redis_client.expire(key, KEEPALIVE_EX)
        obs_metrics.PRESENCE_HEARTBEATS.labels(str(ctx["campus_id"])).inc()

    async def on_nearby_request(self, sid: str, data: dict) -> None:
        obs_metrics.socket_event(self.namespace, "nearby_request")
        ctx = self.users.get(sid)
        if not ctx:
            await self._warn_rate_limited(sid)
            return
        if not await self._check_limits("nearby_request", ctx["user_id"], sid, limit=4, window=5):
            return
        try:
            lat = float(data.get("lat"))
            lon = float(data.get("lon"))
        except (TypeError, ValueError):
            await self.emit("sys.warn", {"code": "invalid_payload"}, room=sid)
            return
        radius = _effective_radius(data.get("radius_m"))
        limit = int(data.get("limit") or DEFAULT_NEARBY_LIMIT)
        if limit <= 0:
            limit = DEFAULT_NEARBY_LIMIT
        obs_metrics.PROXIMITY_QUERIES.labels(radius=str(radius)).inc()
        cursor_state = _decode_cursor(data.get("cursor"))
        fetch_count = max(limit + 2, limit + 1)
        results = await redis_client.geosearch(
            _campus_geo_key(ctx["campus_id"]),
            longitude=lon,
            latitude=lat,
            radius=radius,
            unit="m",
            withdist=True,
            sort="ASC",
            count=fetch_count,
        )
        items: list[dict] = []
        for entry in results:
            member, dist = entry
            member_id = str(member)
            if member_id == ctx["user_id"]:
                continue
            if cursor_state:
                cursor_dist, cursor_member = cursor_state
                if dist < cursor_dist or (dist == cursor_dist and member_id <= cursor_member):
                    continue
            presence = await redis_client.hgetall(_presence_key(member_id))
            if not presence:
                continue
            item = {"id": member_id, "dist_m": float(dist)}
            handle = presence.get("handle")
            if handle:
                item["handle"] = handle
            avatar = presence.get("avatar")
            if avatar:
                item["avatar"] = avatar
            items.append(item)
            if len(items) > limit:
                break
        next_cursor = None
        if len(items) > limit:
            last = items[limit]
            next_cursor = _encode_cursor(last["dist_m"], last["id"])
            items = items[:limit]
        obs_metrics.PROXIMITY_RESULTS.observe(len(items))
        await self.emit("presence.nearby", {"users": items, "cursor": next_cursor}, room=sid)

    async def _authorise(self, environ: dict, auth: Optional[dict]) -> Dict[str, Optional[str]]:
        scope = environ.get("asgi.scope", environ)
        auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
        ctx: Optional[Dict[str, Optional[str]]] = None

        ticket = auth_payload.get("ticket")
        if ticket:
            ctx = await self._consume_ticket(str(ticket))

        if ctx is None:
            token = auth_payload.get("token")
            if not token:
                auth_header = _header(scope, "authorization")
                if auth_header and auth_header.lower().startswith("bearer "):
                    token = auth_header.split(" ", 1)[1]
            if not token:
                raise ValueError("missing_token")
            ctx = parse_access_token(token)

        if not ctx.get("user_id") or not ctx.get("campus_id") or not ctx.get("session_id"):
            raise ValueError("missing_claims")

        return {
            "user_id": str(ctx["user_id"]),
            "campus_id": str(ctx["campus_id"]),
            "session_id": str(ctx["session_id"]),
            "handle": ctx.get("handle"),
        }

    async def _consume_ticket(self, ticket: str) -> Optional[Dict[str, Optional[str]]]:
        key = f"rticket:{ticket}"
        cached = await redis_client.get(key)
        if not cached:
            return None
        await redis_client.delete(key)
        try:
            parsed = json.loads(cached)
        except json.JSONDecodeError:  # pragma: no cover - defensive
            logger.debug("presence ticket decode failed", exc_info=True)
            return None
        user_id = parsed.get("user_id")
        campus_id = parsed.get("campus_id")
        session_id = parsed.get("session_id")
        if not user_id or campus_id is None or not session_id:
            return None
        return {
            "user_id": str(user_id),
            "campus_id": str(campus_id),
            "session_id": str(session_id),
            "handle": parsed.get("handle"),
        }

    async def _emit_resume_snapshot(self, sid: str, ctx: Dict[str, Optional[str]]) -> None:
        key = _presence_key(str(ctx["user_id"]))
        snapshot = await redis_client.hgetall(key)
        if not snapshot:
            return
        if snapshot.get("session_id") != str(ctx["session_id"]):
            return
        try:
            updated_at = int(snapshot.get("updated_at", "0"))
        except ValueError:
            return
        if int(time.time()) - updated_at > RECONNECT_GRACE_SECONDS:
            return
        await self.emit("presence.snapshot", snapshot, room=sid)

    async def _check_limits(self, kind: str, user_id: str, sid: str, *, limit: int, window: int) -> bool:
        socket_allowed = await rate_allow(f"{kind}_socket", f"{user_id}:{sid}", limit=limit, window_seconds=window)
        user_allowed = await rate_allow("presence_user_global", user_id, limit=30, window_seconds=10)
        if socket_allowed and user_allowed:
            return True
        obs_metrics.RATE_LIMITED_EVENTS.labels(kind=kind).inc()
        await self._warn_rate_limited(sid)
        return False

    async def _warn_rate_limited(self, sid: str) -> None:
        if await self._is_backpressured(sid):
            return
        await self.emit("sys.warn", {"code": "rate_limited"}, room=sid)

    async def _is_backpressured(self, sid: str) -> bool:
        engine = getattr(self.server, "eio", None)
        if not engine:
            return False
        try:
            session = await engine.get_session(sid)
        except Exception:
            return False
        queue = session.get("queue") if isinstance(session, dict) else None
        if hasattr(queue, "qsize"):
            try:
                return queue.qsize() > BACKPRESSURE_THRESHOLD
            except Exception:
                return False
        return False

    @staticmethod
    def _user_room(user_id: str) -> str:
        return f"u:{user_id}"

    @staticmethod
    def _campus_room(campus_id: str) -> str:
        return f"c:{campus_id}"
