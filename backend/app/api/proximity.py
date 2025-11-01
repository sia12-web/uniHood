"""REST API surface for proximity features."""

from __future__ import annotations

import time

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.proximity.anti_spoof import is_plausible_movement
from app.domain.proximity.schemas import (
    HeartbeatPayload,
    NearbyQuery,
    NearbyResponse,
    PresenceStatusResponse,
)
from app.domain.proximity.service import get_nearby
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.rate_limit import RateLimitExceeded, allow
from app.infra.redis import redis_client
from app.settings import settings
from app.obs import metrics as obs_metrics

router = APIRouter()

@router.post("/presence/heartbeat")
async def heartbeat(
    payload: HeartbeatPayload,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    limit = 30
    if settings.environment == "dev":
        await allow("hb", auth_user.id, limit=300)
    elif not await allow("hb", auth_user.id, limit=limit):
        obs_metrics.inc_presence_reject("rate_limit")
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate limit")

    plausible = await is_plausible_movement(auth_user.id, payload.lat, payload.lon, payload.ts_client)
    if not plausible:
        if settings.environment == "dev":
            await redis_client.delete(f"presence:{auth_user.id}")
        else:
            obs_metrics.inc_presence_reject("implausible")
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "implausible movement")

    if payload.campus_id and str(payload.campus_id) != str(auth_user.campus_id):
        obs_metrics.inc_presence_reject("campus_mismatch")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "campus mismatch")

    campus_id = str(payload.campus_id or auth_user.campus_id)
    now_ms = int(time.time() * 1000)

    await redis_client.geoadd(
        f"geo:presence:{campus_id}", {auth_user.id: (payload.lon, payload.lat)}
    )
    await redis_client.hset(
        f"presence:{auth_user.id}",
        mapping={
            "lat": payload.lat,
            "lon": payload.lon,
            "accuracy_m": payload.accuracy_m,
            "ts": now_ms,
            "device_id": payload.device_id,
            "campus_id": campus_id,
            "venue_id": payload.venue_id or "",
        },
    )
    await redis_client.expire(f"presence:{auth_user.id}", settings.campus_ttl_seconds)
    await redis_client.setex(f"online:user:{auth_user.id}", settings.campus_ttl_seconds, "1")
    await redis_client.xadd(
        "x:presence.heartbeats",
        {"user_id": auth_user.id, "campus_id": campus_id, "acc": payload.accuracy_m},
    )
    obs_metrics.inc_presence_heartbeat(campus_id)
    return {"ts": now_ms, "ok": True}


@router.post("/presence/offline")
async def go_offline(auth_user: AuthenticatedUser = Depends(get_current_user)):
    """Mark the current user as offline immediately.

    - Remove from campus GEO set using the campus recorded in the presence hash (if any)
    - Delete presence hash and online key
    - Emit an observability event
    """
    presence_key = f"presence:{auth_user.id}"
    presence = await redis_client.hgetall(presence_key)
    campus_id = presence.get("campus_id") if presence else None
    if campus_id:
        try:
            # geo:presence:* is a sorted set under the hood; remove member via ZREM
            await redis_client.zrem(f"geo:presence:{campus_id}", auth_user.id)
        except Exception:
            # Best-effort removal; continue
            pass
    # Remove presence + online markers
    await redis_client.delete(presence_key)
    await redis_client.delete(f"online:user:{auth_user.id}")
    await redis_client.xadd(
        "x:presence.offline",
        {"user_id": auth_user.id, "campus_id": campus_id or "", "reason": "explicit"},
    )
    return {"ok": True}


@router.get("/presence/status/self", response_model=PresenceStatusResponse)
async def presence_status(auth_user: AuthenticatedUser = Depends(get_current_user)):
    ttl = await redis_client.ttl(f"online:user:{auth_user.id}")
    ts = await redis_client.hget(f"presence:{auth_user.id}", "ts")
    return PresenceStatusResponse(online=ttl > 0, ts=int(ts) if ts else None)


async def _build_nearby_query(
    campus_id: Optional[UUID] = Query(default=None),
    radius_m: int = Query(..., ge=1),
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    filter: str = Query(default="all"),
    include: Optional[List[str]] = Query(default=None),
) -> NearbyQuery:
    include_list = list(include) if include else None
    return NearbyQuery(
        campus_id=campus_id,
        radius_m=radius_m,
        cursor=cursor,
        limit=limit,
        filter=filter,
        include=include_list,
    )


@router.get("/proximity/nearby", response_model=NearbyResponse)
async def nearby(
    query: NearbyQuery = Depends(_build_nearby_query),
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    if query.campus_id and str(query.campus_id) != str(auth_user.campus_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "campus mismatch")
    try:
        response = await get_nearby(auth_user, query)
    except RateLimitExceeded:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate limit") from None
    except LookupError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "presence not found") from None
    obs_metrics.inc_proximity_query(query.radius_m)
    return response

