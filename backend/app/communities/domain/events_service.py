"""Event service layer for communities events and venues."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import asyncpg

from zoneinfo import ZoneInfo

from app.communities.domain import events, models, policies, repo as repo_module
from app.communities.domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.communities.infra import idempotency, redis_streams
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


@dataclass(slots=True)
class _EventContext:
	event: models.Event
	counter: models.EventCounter
	group: models.Group
	membership_role: str | None
	venue: models.EventVenue | None


class EventsService:
	"""Business logic for event CRUD, listing, and exports."""

	def __init__(self, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def create_event(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.EventCreateRequest,
		*,
		idempotency_key: str | None = None,
	) -> dto.EventResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		if membership is None:
			raise ForbiddenError("membership_required")
		policies.assert_can_moderate(membership.role)
		self._validate_rrule(payload.rrule)
		start_at, end_at = self._normalize_window(payload.start_at, payload.end_at, payload.all_day)
		campus_id = payload.campus_id or group.campus_id
		key = policies.ensure_idempotency_key(idempotency_key)
		body = payload.model_dump(mode="json")
		body.update({"start_at": start_at.isoformat(), "end_at": end_at.isoformat(), "campus_id": str(campus_id) if campus_id else None})
		body_hash = idempotency.compute_hash(body=body)

		async def _producer() -> dto.EventResponse:
			event, counter = await self.repo.create_event(
				group_id=group_id,
				campus_id=campus_id,
				title=payload.title,
				description=payload.description,
				venue_id=payload.venue_id,
				start_at=start_at,
				end_at=end_at,
				all_day=payload.all_day,
				capacity=payload.capacity,
				visibility=payload.visibility,
				rrule=payload.rrule,
				allow_guests=payload.allow_guests,
				created_by=UUID(user.id),
			)
			venue = await self.repo.get_event_venue(event.venue_id) if event.venue_id else None
			await self._enqueue_outbox(
				"event",
				event.id,
				"created",
				events.event_payload(event, counters=counter, venue=venue),
			)
			await redis_streams.publish_event_event(
				"created",
				event_id=str(event.id),
				group_id=str(event.group_id),
				actor_id=user.id,
			)
			obs_metrics.inc_event_created()
			return self._event_to_response(event, counter, role=membership.role, venue=venue)

		return await idempotency.resolve(
			key=key,
			body_hash=body_hash,
			producer=_producer,
			serializer=lambda response: response.model_dump(mode="json"),
			deserializer=lambda raw: dto.EventResponse.model_validate(raw),
		)

	async def list_group_events(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		*,
		limit: int,
		after: str | None = None,
		scope: str | None = None,
	) -> dto.EventListResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.ensure_cursor_limit(limit)
		if scope not in {None, "upcoming", "past", "all"}:
			raise ValidationError("invalid_scope")
		role = membership.role if membership else None
		effective_scope = scope or "upcoming"
		events_with_counters, next_cursor = await self.repo.list_group_events(
			group_id,
			limit=limit,
			after=after,
			scope=effective_scope,
		)
		items: list[dto.EventResponse] = []
		for event, counter in events_with_counters:
			if not self._can_view_event(event, role=role):
				continue
			items.append(self._event_to_response(event, counter, role=role))
		return dto.EventListResponse(items=items, next_cursor=next_cursor)

	async def get_event(self, user: AuthenticatedUser, event_id: UUID) -> dto.EventResponse:
		context = await self._load_event_context(event_id, user)
		return self._event_to_response(
			context.event,
			context.counter,
			role=context.membership_role,
			venue=context.venue,
		)

	async def update_event(
		self,
		user: AuthenticatedUser,
		event_id: UUID,
		payload: dto.EventUpdateRequest,
	) -> dto.EventResponse:
		context = await self._load_event_context(event_id, user)
		if context.membership_role is None:
			raise ForbiddenError("membership_required")
		policies.assert_can_moderate(context.membership_role)
		data = payload.model_dump(exclude_unset=True)
		if not data:
			return self._event_to_response(context.event, context.counter, role=context.membership_role, venue=context.venue)
		updates: dict[str, Any] = {}
		needs_time_update = any(key in data for key in ("start_at", "end_at", "all_day"))
		if needs_time_update:
			start_input = data.get("start_at", context.event.start_at)
			end_input = data.get("end_at", context.event.end_at)
			all_day = data.get("all_day", context.event.all_day)
			if start_input is None or end_input is None:
				raise ValidationError("invalid_time_range")
			start_at, end_at = self._normalize_window(start_input, end_input, all_day)
			updates["start_at"] = start_at
			updates["end_at"] = end_at
			updates["all_day"] = all_day
		if "title" in data:
			updates["title"] = data["title"]
		if "description" in data:
			updates["description"] = data["description"]
		if "venue_id" in data:
			updates["venue_id"] = data["venue_id"]
		if "visibility" in data:
			updates["visibility"] = data["visibility"]
		if "allow_guests" in data:
			updates["allow_guests"] = data["allow_guests"]
		if "campus_id" in data:
			updates["campus_id"] = data["campus_id"]
		if "rrule" in data:
			rule_value = data["rrule"]
			self._validate_rrule(rule_value)
			updates["rrule"] = rule_value
		if "capacity" in data:
			cap_value = data["capacity"]
			if cap_value is not None and cap_value < context.counter.going:
				raise ConflictError("capacity_conflict")
			updates["capacity"] = cap_value
		if not updates:
			return self._event_to_response(context.event, context.counter, role=context.membership_role, venue=context.venue)
		updated = await self.repo.update_event(event_id=event_id, payload=updates)
		if not updated:
			raise NotFoundError("event_not_found")
		counter = await self.repo.get_event_counter(event_id)
		venue = await self.repo.get_event_venue(updated.venue_id) if updated.venue_id else None
		await self._enqueue_outbox(
			"event",
			updated.id,
			"updated",
			events.event_payload(updated, counters=counter, venue=venue),
		)
		await redis_streams.publish_event_event(
			"updated",
			event_id=str(updated.id),
			group_id=str(updated.group_id),
			actor_id=user.id,
		)
		return self._event_to_response(updated, counter, role=context.membership_role, venue=venue)

	async def delete_event(self, user: AuthenticatedUser, event_id: UUID) -> None:
		context = await self._load_event_context(event_id, user)
		if context.membership_role is None:
			raise ForbiddenError("membership_required")
		policies.assert_can_moderate(context.membership_role)
		deleted = await self.repo.soft_delete_event(event_id)
		if not deleted:
			raise NotFoundError("event_not_found")
		await self._enqueue_outbox(
			"event",
			deleted.id,
			"deleted",
			events.event_payload(deleted, counters=context.counter, venue=context.venue),
		)
		await redis_streams.publish_event_event(
			"deleted",
			event_id=str(deleted.id),
			group_id=str(deleted.group_id),
			actor_id=user.id,
		)
		return None

	async def preview_reminders(self, user: AuthenticatedUser, event_id: UUID) -> dto.EventReminderPreviewResponse:
		context = await self._load_event_context(event_id, user)
		if context.membership_role is None:
			raise ForbiddenError("membership_required")
		policies.assert_can_moderate(context.membership_role)
		schedule = self._reminder_schedule(context.event.start_at)
		schedule_sorted = sorted(schedule)
		return dto.EventReminderPreviewResponse(event_id=context.event.id, schedule=schedule_sorted)

	async def export_ics(self, user: AuthenticatedUser, event_id: UUID) -> str:
		context = await self._load_event_context(event_id, user)
		return self._build_ics_content(context.event, context.venue)

	# ------------------------------------------------------------------
	# Internal helpers

	async def _with_conn(self, func) -> Any:
		pool = await get_pool()
		async with pool.acquire() as conn:
			return await func(conn)

	async def _enqueue_outbox(
		self,
		aggregate_type: str,
		aggregate_id: UUID,
		event_type: str,
		payload: dict[str, Any],
	) -> None:
		async def _runner(conn: asyncpg.Connection) -> None:
			await self.repo.enqueue_outbox(
				conn=conn,
				aggregate_type=aggregate_type,
				aggregate_id=aggregate_id,
				event_type=event_type,
				payload=payload,
			)

		await self._with_conn(_runner)

	async def _ensure_group_visible(
		self,
		group_id: UUID,
		user: AuthenticatedUser,
	) -> tuple[models.Group, models.GroupMember | None]:
		group = await self.repo.get_group(group_id)
		membership = await self.repo.get_member(group_id, UUID(user.id))
		is_member = membership is not None
		group = policies.require_visible(group, is_member=is_member)
		return group, membership

	def _event_to_response(
		self,
		event: models.Event,
		counter: models.EventCounter,
		*,
		role: str | None,
		venue: models.EventVenue | None = None,
	) -> dto.EventResponse:
		return dto.EventResponse(
			id=event.id,
			group_id=event.group_id,
			campus_id=event.campus_id,
			title=event.title,
			description=event.description,
			venue_id=event.venue_id,
			start_at=event.start_at,
			end_at=event.end_at,
			all_day=event.all_day,
			capacity=event.capacity,
			visibility=event.visibility,
			rrule=event.rrule,
			allow_guests=event.allow_guests,
			created_by=event.created_by,
			created_at=event.created_at,
			updated_at=event.updated_at,
			deleted_at=event.deleted_at,
			counters=dto.EventCounters(
				going=counter.going,
				waitlisted=counter.waitlisted,
				interested=counter.interested,
			),
			role=role,
		)

	def _can_view_event(self, event: models.Event, *, role: str | None) -> bool:
		if event.visibility == "public":
			return True
		return role is not None

	def _assert_event_visibility(self, event: models.Event, *, role: str | None) -> None:
		if not self._can_view_event(event, role=role):
			raise ForbiddenError("event_not_visible")

	async def _load_event_context(
		self,
		event_id: UUID,
		user: AuthenticatedUser,
		*,
		for_update: bool = False,
	) -> _EventContext:
		result = await self.repo.get_event_with_counter(event_id, for_update=for_update)
		if not result:
			raise NotFoundError("event_not_found")
		event, counter = result
		if event.deleted_at is not None:
			raise NotFoundError("event_not_found")
		group, membership = await self._ensure_group_visible(event.group_id, user)
		role = membership.role if membership else None
		self._assert_event_visibility(event, role=role)
		venue = await self.repo.get_event_venue(event.venue_id) if event.venue_id else None
		return _EventContext(event=event, counter=counter, group=group, membership_role=role, venue=venue)

	def _normalize_window(
		self,
		start_at: datetime,
		end_at: datetime,
		all_day: bool,
	) -> tuple[datetime, datetime]:
		if start_at.tzinfo is None or end_at.tzinfo is None:
			raise ValidationError("datetime_timezone_required")
		start_utc = start_at.astimezone(timezone.utc)
		end_utc = end_at.astimezone(timezone.utc)
		if all_day:
			start_utc = start_utc.replace(hour=0, minute=0, second=0, microsecond=0)
			end_utc = start_utc + timedelta(hours=23, minutes=59, seconds=59)
		if end_utc <= start_utc:
			raise ValidationError("invalid_time_range")
		if end_utc - start_utc > timedelta(days=14):
			raise ValidationError("event_duration_too_long")
		return start_utc, end_utc

	def _validate_rrule(self, rrule: str | None) -> None:
		if rrule is None:
			return
		value = rrule.strip().upper()
		if not value:
			return
		if not (value.startswith("RRULE:") or value.startswith("FREQ=")):
			raise ValidationError("unsupported_rrule")

	@staticmethod
	def _build_ics_content(event: models.Event, venue: models.EventVenue | None) -> str:
		tz_name = (venue.tz if venue and venue.tz else "UTC") or "UTC"
		try:
			tzinfo = ZoneInfo(tz_name)
		except Exception:  # pragma: no cover - defensive fallback for invalid tz strings
			tzinfo = ZoneInfo("UTC")
		start_local = event.start_at.astimezone(tzinfo)
		end_local = event.end_at.astimezone(tzinfo)
		dtstamp = datetime.now(timezone.utc)
		location = ""
		if venue:
			location = venue.address or venue.url or venue.name or ""
		uid = f"{event.id}@divan"
		lines = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Divan//Communities//EN",
			"BEGIN:VEVENT",
			f"UID:{uid}",
			f"DTSTAMP:{dtstamp.strftime('%Y%m%dT%H%M%SZ')}",
			f"DTSTART;TZID={tz_name}:{start_local.strftime('%Y%m%dT%H%M%S')}",
			f"DTEND;TZID={tz_name}:{end_local.strftime('%Y%m%dT%H%M%S')}",
			f"SUMMARY:{EventsService._escape_ics(event.title)}",
			f"DESCRIPTION:{EventsService._escape_ics(event.description)}",
			f"LOCATION:{EventsService._escape_ics(location)}",
			"END:VEVENT",
			"END:VCALENDAR",
		]
		return "\r\n".join(lines) + "\r\n"

	@staticmethod
	def _escape_ics(value: str) -> str:
		return value.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,")

	@staticmethod
	def _reminder_schedule(start_at: datetime) -> list[datetime]:
		return [start_at - timedelta(hours=24), start_at - timedelta(hours=1)]
