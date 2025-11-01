"""RSVP orchestration for communities events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import asyncpg

from app.communities.domain import events, models, policies, repo as repo_module
from app.communities.domain.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.communities.schemas import dto
from app.communities.infra import redis_streams
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


@dataclass(slots=True)
class _RSVPContext:
	event: models.Event
	counter: models.EventCounter
	group: models.Group
	membership_role: str | None


class RSVPService:
	"""Handles RSVP lifecycle, waitlist promotion, and counters."""

	def __init__(self, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def upsert_rsvp(
		self,
		user: AuthenticatedUser,
		event_id: UUID,
		payload: dto.RSVPUpsertRequest,
	) -> dto.RSVPResponse:
		user_id = UUID(user.id)
		guests_requested = payload.guests
		if guests_requested is not None and guests_requested < 0:
			raise ValidationError("invalid_guest_count")
		pool = await get_pool()
		promotions: list[models.EventRSVP] = []
		new_rsvp: models.EventRSVP | None = None
		dto_response: dto.RSVPResponse | None = None
		final_status = payload.status
		async with pool.acquire() as conn:
			async with conn.transaction():
				context = await self._load_context(event_id, user, for_update=True, conn=conn)
				new_rsvp, promotions, final_status = await self._upsert_rsvp_tx(
					conn=conn,
					context=context,
					target_user_id=user_id,
					requested_status=payload.status,
					requested_guests=guests_requested,
					allow_auto_waitlist=True,
				)
				dto_response = self._response(new_rsvp)
		await self._enqueue_outbox(new_rsvp.id, "updated", events.rsvp_payload(new_rsvp))
		await redis_streams.publish_rsvp_event(
			"updated",
			rsvp_id=str(new_rsvp.id),
			event_id=str(new_rsvp.event_id),
			user_id=str(new_rsvp.user_id),
			actor_id=user.id,
		)
		obs_metrics.inc_event_rsvp_updated(final_status)
		if promotions:
			for promo in promotions:
				await self._enqueue_outbox(promo.id, "promoted", events.rsvp_payload(promo))
				await redis_streams.publish_rsvp_event(
					"promoted",
					rsvp_id=str(promo.id),
					event_id=str(promo.event_id),
					user_id=str(promo.user_id),
					actor_id=user.id,
				)
			obs_metrics.inc_event_waitlist_promotions(len(promotions))
		assert dto_response is not None and new_rsvp is not None
		return dto_response

	async def admin_update_rsvp(
		self,
		actor: AuthenticatedUser,
		event_id: UUID,
		target_user_id: UUID,
		payload: dto.RSVPAdminUpdateRequest,
	) -> dto.RSVPResponse:
		guests_requested = payload.guests
		if guests_requested is not None and guests_requested < 0:
			raise ValidationError("invalid_guest_count")
		pool = await get_pool()
		promotions: list[models.EventRSVP] = []
		new_rsvp: models.EventRSVP | None = None
		dto_response: dto.RSVPResponse | None = None
		final_status = payload.status
		async with pool.acquire() as conn:
			async with conn.transaction():
				context = await self._load_context(event_id, actor, for_update=True, conn=conn)
				if context.membership_role is None:
					raise ForbiddenError("membership_required")
				policies.assert_can_moderate(context.membership_role)
				new_rsvp, promotions, final_status = await self._upsert_rsvp_tx(
					conn=conn,
					context=context,
					target_user_id=target_user_id,
					requested_status=payload.status,
					requested_guests=guests_requested,
					allow_auto_waitlist=True,
				)
				dto_response = self._response(new_rsvp)
		await self._enqueue_outbox(new_rsvp.id, "updated", events.rsvp_payload(new_rsvp))
		await redis_streams.publish_rsvp_event(
			"updated",
			rsvp_id=str(new_rsvp.id),
			event_id=str(new_rsvp.event_id),
			user_id=str(new_rsvp.user_id),
		)
		obs_metrics.inc_event_rsvp_updated(final_status)
		if promotions:
			for promo in promotions:
				await self._enqueue_outbox(promo.id, "promoted", events.rsvp_payload(promo))
				await redis_streams.publish_rsvp_event(
					"promoted",
					rsvp_id=str(promo.id),
					event_id=str(promo.event_id),
					user_id=str(promo.user_id),
				)
			obs_metrics.inc_event_waitlist_promotions(len(promotions))
		assert dto_response is not None and new_rsvp is not None
		return dto_response

	async def delete_rsvp(
		self,
		actor: AuthenticatedUser,
		event_id: UUID,
		target_user_id: UUID,
	) -> None:
		pool = await get_pool()
		removal: models.EventRSVP | None = None
		promotions: list[models.EventRSVP] = []
		async with pool.acquire() as conn:
			async with conn.transaction():
				context = await self._load_context(event_id, actor, for_update=True, conn=conn)
				if str(target_user_id) != actor.id:
					if context.membership_role is None:
						raise ForbiddenError("membership_required")
					policies.assert_can_moderate(context.membership_role)
				existing = await self.repo.get_event_rsvp(conn=conn, event_id=event_id, user_id=target_user_id)
				if not existing:
					raise NotFoundError("rsvp_not_found")
				removal = await self.repo.delete_event_rsvp(conn=conn, event_id=event_id, user_id=target_user_id)
				if removal is None:
					raise NotFoundError("rsvp_not_found")
				going_delta = -(1 + removal.guests) if removal.status == "going" else 0
				waitlisted_delta = -1 if removal.status == "waitlisted" else 0
				interested_delta = -1 if removal.status == "interested" else 0
				counter = await self.repo.adjust_event_counter(
					event_id,
					conn=conn,
					going_delta=going_delta,
					waitlisted_delta=waitlisted_delta,
					interested_delta=interested_delta,
				)
				freed_slots = (1 + removal.guests) if removal.status == "going" else 0
				capacity_available = context.event.capacity is not None and counter.going < context.event.capacity
				if freed_slots > 0 or capacity_available:
					promotions, _ = await self._promote_waitlist_tx(
						conn,
						context.event,
						counter,
						freed_slots if freed_slots > 0 else None,
					)
		if removal is None:
			raise NotFoundError("rsvp_not_found")
		await self._enqueue_outbox(removal.id, "deleted", events.rsvp_payload(removal))
		await redis_streams.publish_rsvp_event(
			"declined",
			rsvp_id=str(removal.id),
			event_id=str(removal.event_id),
			user_id=str(removal.user_id),
			actor_id=actor.id,
		)
		obs_metrics.inc_event_rsvp_updated("declined")
		if promotions:
			for promo in promotions:
				await self._enqueue_outbox(promo.id, "promoted", events.rsvp_payload(promo))
				await redis_streams.publish_rsvp_event(
					"promoted",
					rsvp_id=str(promo.id),
					event_id=str(promo.event_id),
					user_id=str(promo.user_id),
					actor_id=actor.id,
				)
			obs_metrics.inc_event_waitlist_promotions(len(promotions))
		return None

	async def promote_waitlist(self, event_id: UUID) -> list[dto.RSVPResponse]:
		pool = await get_pool()
		promotions: list[models.EventRSVP] = []
		async with pool.acquire() as conn:
			async with conn.transaction():
				context = await self._load_context(event_id, None, for_update=True, conn=conn)
				if context.event.capacity is None:
					return []
				available = context.event.capacity - context.counter.going
				if available <= 0:
					return []
				promotions, _ = await self._promote_waitlist_tx(conn, context.event, context.counter, available)
		if not promotions:
			return []
		for promo in promotions:
			await self._enqueue_outbox(promo.id, "promoted", events.rsvp_payload(promo))
			await redis_streams.publish_rsvp_event(
				"promoted",
				rsvp_id=str(promo.id),
				event_id=str(promo.event_id),
				user_id=str(promo.user_id),
			)
		obs_metrics.inc_event_waitlist_promotions(len(promotions))
		return [self._response(promo) for promo in promotions]

	# ------------------------------------------------------------------
	# Helpers

	async def _with_conn(self, func) -> Any:
		pool = await get_pool()
		async with pool.acquire() as conn:
			return await func(conn)

	async def _load_context(
		self,
		event_id: UUID,
		user: AuthenticatedUser | None,
		*,
		for_update: bool = False,
		conn: asyncpg.Connection | None = None,
	) -> _RSVPContext:
		async def _fetch(connection: asyncpg.Connection) -> _RSVPContext:
			result = await self.repo.get_event_with_counter(event_id, conn=connection, for_update=for_update)
			if not result:
				raise NotFoundError("event_not_found")
			event, counter = result
			if event.deleted_at is not None:
				raise NotFoundError("event_not_found")
			group = await self.repo.get_group(event.group_id)
			if group is None or group.deleted_at is not None:
				raise NotFoundError("group_not_found")
			role = None
			if user is not None:
				membership = await self.repo.get_member(event.group_id, UUID(user.id))
				role = membership.role if membership else None
				if group.visibility != "public" and membership is None:
					raise ForbiddenError("membership_required")
				if event.visibility != "public" and membership is None:
					raise ForbiddenError("event_not_visible")
			rel = _RSVPContext(event=event, counter=counter, group=group, membership_role=role)
			return rel
		if conn is not None:
			return await _fetch(conn)
		return await self._with_conn(lambda connection: _fetch(connection))

	@staticmethod
	def _status_seat_count(status: str, guests: int) -> int:
		return (1 + guests) if status == "going" else 0

	@staticmethod
	def _counter_deltas(
		previous_status: str | None,
		previous_guests: int,
		new_status: str,
		new_guests: int,
	) -> tuple[int, int, int]:
		going_delta = 0
		waitlisted_delta = 0
		interested_delta = 0
		if previous_status == "going":
			going_delta -= 1 + previous_guests
		elif previous_status == "waitlisted":
			waitlisted_delta -= 1
		elif previous_status == "interested":
			interested_delta -= 1
		if new_status == "going":
			going_delta += 1 + new_guests
		elif new_status == "waitlisted":
			waitlisted_delta += 1
		elif new_status == "interested":
			interested_delta += 1
		return going_delta, waitlisted_delta, interested_delta

	async def _enqueue_outbox(
		self,
		aggregate_id: UUID,
		event_type: str,
		payload: dict[str, Any],
	) -> None:
		async def _runner(conn: asyncpg.Connection) -> None:
			await self.repo.enqueue_outbox(
				conn=conn,
				aggregate_type="rsvp",
				aggregate_id=aggregate_id,
				event_type=event_type,
				payload=payload,
			)

		await self._with_conn(_runner)

	async def _upsert_rsvp_tx(
		self,
		*,
		conn: asyncpg.Connection,
		context: _RSVPContext,
		target_user_id: UUID,
		requested_status: str,
		requested_guests: int | None,
		allow_auto_waitlist: bool,
	) -> tuple[models.EventRSVP, list[models.EventRSVP], str]:
		previous = await self.repo.get_event_rsvp(conn=conn, event_id=context.event.id, user_id=target_user_id)
		prev_status = previous.status if previous else None
		prev_guests = previous.guests if previous else 0
		status = requested_status
		base_guests = requested_guests if requested_guests is not None else (prev_guests if prev_status == "going" else 0)
		if base_guests < 0:
			raise ValidationError("invalid_guest_count")
		guests = base_guests if status == "going" else 0
		if guests > 0 and not context.event.allow_guests:
			raise ValidationError("guests_not_allowed")
		if status == "going":
			current_seats = context.counter.going
			prev_seats = 1 + prev_guests if prev_status == "going" else 0
			projected = current_seats - prev_seats + (1 + guests)
			if context.event.capacity is not None and projected > context.event.capacity and allow_auto_waitlist:
				status = "waitlisted"
				guests = 0
		elif status == "waitlisted" and context.event.capacity is None:
			status = "going"
			guests = requested_guests
		if status != "going":
			guests = 0
		new_rsvp = await self.repo.upsert_event_rsvp(
			conn=conn,
			event_id=context.event.id,
			user_id=target_user_id,
			status=status,
			guests=guests,
		)
		going_delta, waitlisted_delta, interested_delta = self._counter_deltas(prev_status, prev_guests, status, guests)
		counter = await self.repo.adjust_event_counter(
			context.event.id,
			conn=conn,
			going_delta=going_delta,
			waitlisted_delta=waitlisted_delta,
			interested_delta=interested_delta,
		)
		context.counter = counter
		freed_slots = 0
		if prev_status == "going":
			freed_slots = (1 + prev_guests) - (1 + guests if status == "going" else 0)
		promotions, updated_counter = await self._promote_waitlist_tx(
			conn,
			context.event,
			counter,
			freed_slots if freed_slots > 0 else None,
		)
		context.counter = updated_counter
		return new_rsvp, promotions, status

	async def _promote_waitlist_tx(
		self,
		conn: asyncpg.Connection,
		event: models.Event,
		counter: models.EventCounter,
		freed_slots: int | None,
	) -> tuple[list[models.EventRSVP], models.EventCounter]:
		if event.capacity is None:
			return [], counter
		available = event.capacity - counter.going
		if available <= 0:
			return [], counter
		limit = available if freed_slots is None else min(available, freed_slots)
		if limit <= 0:
			return [], counter
		waitlisted = await self.repo.list_waitlisted_rsvps(event.id, conn=conn, limit=limit)
		promotions: list[models.EventRSVP] = []
		for entry in waitlisted:
			promoted = await self.repo.upsert_event_rsvp(
				conn=conn,
				 event_id=event.id,
				 user_id=entry.user_id,
				 status="going",
				 guests=0,
			)
			counter = await self.repo.adjust_event_counter(
				event.id,
				conn=conn,
				going_delta=1,
				waitlisted_delta=-1,
			)
			promotions.append(promoted)
		return promotions, counter

	@staticmethod
	def _response(rsvp: models.EventRSVP) -> dto.RSVPResponse:
		return dto.RSVPResponse(
			id=rsvp.id,
			event_id=rsvp.event_id,
			user_id=rsvp.user_id,
			status=rsvp.status,
			guests=rsvp.guests,
			created_at=rsvp.created_at,
			updated_at=rsvp.updated_at,
		)
