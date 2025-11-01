"""FastAPI routers for communities domain."""

from __future__ import annotations

from fastapi import APIRouter

from app.communities.api import (
	audit,
	attachments,
	bans_mutes,
	comments,
	escalate,
	events,
	feeds,
	groups,
	invites,
	join_requests,
	members,
	notifications,
	posts,
	presence,
	reactions,
	roles,
	search,
	rsvps,
	tags,
	typeahead,
	uploads,
)

router = APIRouter(prefix="/api/communities/v1")

router.include_router(groups.router)
router.include_router(members.router)
router.include_router(posts.router)
router.include_router(comments.router)
router.include_router(reactions.router)
router.include_router(attachments.router)
router.include_router(uploads.router)
router.include_router(tags.router)
router.include_router(feeds.router)
router.include_router(events.router)
router.include_router(rsvps.router)
router.include_router(search.router)
router.include_router(typeahead.router)
router.include_router(notifications.router)
router.include_router(presence.router)
router.include_router(roles.router)
router.include_router(invites.router)
router.include_router(join_requests.router)
router.include_router(bans_mutes.router)
router.include_router(audit.router)
router.include_router(escalate.router)

__all__ = ["router"]
