"""Helper utilities to format outbox payloads for communities."""

from __future__ import annotations

from typing import Any

from app.communities.domain import models


def group_payload(group: models.Group) -> dict[str, Any]:
	return {
		"id": str(group.id),
		"name": group.name,
		"slug": group.slug,
		"visibility": group.visibility,
		"campus_id": str(group.campus_id) if group.campus_id else None,
		"tags": group.tags,
		"created_at": group.created_at.isoformat(),
		"deleted": group.deleted_at is not None,
	}


def post_payload(post: models.Post) -> dict[str, Any]:
	return {
		"id": str(post.id),
		"group_id": str(post.group_id),
		"title": post.title,
		"body": post.body[:5000],
		"topic_tags": post.topic_tags,
		"created_at": post.created_at.isoformat(),
		"deleted": post.deleted_at is not None,
	}


def comment_payload(comment: models.Comment) -> dict[str, Any]:
	return {
		"id": str(comment.id),
		"post_id": str(comment.post_id),
		"body": comment.body[:1000],
		"created_at": comment.created_at.isoformat(),
		"deleted": comment.deleted_at is not None,
	}


def reaction_payload(reaction: models.Reaction) -> dict[str, Any]:
	return {
		"id": str(reaction.id),
		"subject_type": reaction.subject_type,
		"subject_id": str(reaction.subject_id),
		"emoji": reaction.emoji,
		"created_at": reaction.created_at.isoformat(),
	}


def event_payload(event: models.Event, *, counters: models.EventCounter | None = None, venue: models.EventVenue | None = None) -> dict[str, Any]:
	data: dict[str, Any] = {
		"id": str(event.id),
		"group_id": str(event.group_id),
		"title": event.title,
		"body": event.description[:5000],
		"campus_id": str(event.campus_id) if event.campus_id else None,
		"start_at": event.start_at.isoformat(),
		"end_at": event.end_at.isoformat(),
		"all_day": event.all_day,
		"visibility": event.visibility,
		"venue_id": str(event.venue_id) if event.venue_id else None,
		"deleted": event.deleted_at is not None,
		"allow_guests": event.allow_guests,
		"rrule": event.rrule,
	}
	if counters is not None:
		data.update(
			{
				"going": counters.going,
				"waitlisted": counters.waitlisted,
				"interested": counters.interested,
			}
		)
	if venue is not None:
		data.update(
			{
				"venue_kind": venue.kind,
				"venue_text": venue.address or venue.url or venue.name,
			}
		)
	return data


def rsvp_payload(rsvp: models.EventRSVP) -> dict[str, Any]:
	return {
		"id": str(rsvp.id),
		"event_id": str(rsvp.event_id),
		"user_id": str(rsvp.user_id),
		"status": rsvp.status,
		"guests": rsvp.guests,
		"created_at": rsvp.created_at.isoformat(),
	}
