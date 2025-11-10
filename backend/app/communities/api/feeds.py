"""Feed endpoints for communities."""

from __future__ import annotations

import base64
import json
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_admin_user, get_current_user
from app.communities.ranking.feed_ranker import ScoredPost, rank_posts
from app.communities.services import feed_home

router = APIRouter(tags=["communities:feeds"])
_service = CommunitiesService()


def _encode_feed_cursor(score: float, created_at: datetime, post_id: str) -> str:
    payload = {
        "score": score,
        "created_at": created_at.isoformat(),
        "id": post_id,
    }
    blob = json.dumps(payload, separators=(",", ":"))
    return base64.urlsafe_b64encode(blob.encode("utf-8")).decode("ascii")


def _decode_feed_cursor(value: str) -> Tuple[float, datetime, UUID]:
    try:
        decoded = base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        data: Dict[str, Any] = json.loads(decoded)
        score = float(data["score"])
        created_at = datetime.fromisoformat(data["created_at"])
        post_uuid = UUID(str(data["id"]))
        return score, created_at, post_uuid
    except (KeyError, ValueError, TypeError) as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="bad_cursor") from exc


@router.get("/feed", response_model=dto.RankedFeedResponse)
async def get_ranked_feed_endpoint(
    limit: int = Query(default=20, ge=10, le=50),
    cursor: str | None = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.RankedFeedResponse:
    campus_value = getattr(auth_user, "campus_id", None)
    campus_id = str(campus_value) if campus_value else None
    cursor_state: Optional[Tuple[datetime, UUID]] = None
    if cursor:
        _previous_score, created_at, post_uuid = _decode_feed_cursor(cursor)
        cursor_state = (created_at, post_uuid)
    enabled = await feed_home.feed_rank_enabled(auth_user.id, campus_id)
    limit_prefetch = min(1000, max(limit * 5, limit))
    candidates = await feed_home.load_feed_candidates(auth_user.id, campus_id, cursor_state, limit_pre=limit_prefetch)
    if not candidates:
        return dto.RankedFeedResponse(items=[], next=None)
    features = await feed_home.fetch_post_features(auth_user.id, candidates)
    coeff = await feed_home.resolve_feed_coefficients(auth_user.id, campus_id)
    meta_by_id = {str(entry["id"]): entry for entry in candidates}
    ranked_posts: List[ScoredPost] = []
    if enabled and features:
        ranked_posts = rank_posts(features, coeff)
    if not ranked_posts:
        ranked_posts = [
            ScoredPost(
                post_id=str(entry["id"]),
                score=0.0,
                created_at=entry["created_at"],
                author_id=str(entry["author_id"]),
            )
            for entry in candidates
        ]
        ranked_posts.sort(key=lambda item: (item.created_at, item.post_id), reverse=True)
    cap_per_author = 2
    ordered: List[Tuple[ScoredPost, dict]] = []
    counts = defaultdict(int)
    for scored in ranked_posts:
        meta = meta_by_id.get(scored.post_id)
        if meta is None:
            continue
        if counts[scored.author_id] >= cap_per_author:
            continue
        ordered.append((scored, meta))
        counts[scored.author_id] += 1
        if len(ordered) >= limit + 1:
            break
    items_payload = ordered[:limit]
    response_items: List[dto.RankedFeedItem] = []
    for scored, meta in items_payload:
        response_items.append(
            dto.RankedFeedItem(
                post_id=UUID(scored.post_id),
                author_id=UUID(scored.author_id),
                group_id=UUID(str(meta["group_id"])),
                score=scored.score,
                created_at=scored.created_at,
            )
        )
    next_cursor = None
    if len(ordered) > limit:
        next_scored, _next_meta = ordered[limit]
        next_cursor = _encode_feed_cursor(next_scored.score, next_scored.created_at, next_scored.post_id)
    return dto.RankedFeedResponse(items=response_items, next=next_cursor)


@router.get("/feeds/user", response_model=dto.FeedListResponse)
async def get_user_feed_endpoint(
    limit: int = Query(default=20, ge=1, le=50),
    after: str | None = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.FeedListResponse:
    try:
        return await _service.get_user_feed(auth_user, limit=limit, after=after)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


@router.get("/feeds/group/{group_id}", response_model=dto.PostListResponse)
async def get_group_feed_endpoint(
    group_id: UUID,
    limit: int = Query(default=20, ge=1, le=50),
    after: str | None = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostListResponse:
    try:
        return await _service.get_group_feed(auth_user, group_id, limit=limit, after=after)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


@router.post("/feeds/rebuild", response_model=dto.FeedRebuildResponse)
async def enqueue_feed_rebuild_endpoint(
    payload: dto.FeedRebuildRequest,
    admin_user: AuthenticatedUser = Depends(get_admin_user),
) -> dto.FeedRebuildResponse:
    _ = admin_user  # silence unused warning
    try:
        return await _service.enqueue_feed_rebuild(payload)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


__all__ = ["router"]
