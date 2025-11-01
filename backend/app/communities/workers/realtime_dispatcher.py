"""Realtime dispatcher bridging Redis streams to Socket.IO and notifications."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Dict
from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.infra import rate_limiter, redis_streams
from app.communities.sockets import server as socket_server
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)


@dataclass(slots=True)
class _EventContext:
	stream: str
	event: str
	entity: str
	id: str
	group_id: str | None = None
	post_id: str | None = None
	event_id: str | None = None
	actor_id: str | None = None
	extra: dict[str, str] | None = None


class RealtimeDispatcher:
	"""Consumes communities streams, emits socket events, and enqueues notifications."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		poll_interval: float = 0.5,
		batch_size: int = 200,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.poll_interval = poll_interval
		self.batch_size = batch_size
		self._running = False
		self._last_ids: Dict[str, str] = {
			redis_streams.STREAM_POST: "0-0",
			redis_streams.STREAM_COMMENT: "0-0",
			redis_streams.STREAM_EVENT: "0-0",
			redis_streams.STREAM_RSVP: "0-0",
		}

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			processed = await self.process_once()
			if processed == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		streams = dict(self._last_ids)
		if not streams:
			return 0
		messages = await redis_client.xread(streams=streams, count=self.batch_size, block=1000)
		if not messages:
			return 0
		processed = 0
		for stream_name, entries in messages:
			for entry_id, payload in entries:
				ctx = self._parse_event(stream_name, dict(payload))
				if ctx is None:
					self._last_ids[stream_name] = entry_id
					continue
				await self._dispatch(ctx)
				self._last_ids[stream_name] = entry_id
				processed += 1
		return processed

	def _parse_event(self, stream: str, payload: dict[str, str]) -> _EventContext | None:
		event = payload.get("event")
		entity = payload.get("entity")
		if not event or not entity:
			return None
		return _EventContext(
			stream=stream,
			event=event,
			entity=entity,
			id=payload.get("id", ""),
			group_id=payload.get("group_id"),
			post_id=payload.get("post_id"),
			event_id=payload.get("event_id"),
			actor_id=payload.get("actor_id"),
			extra=payload,
		)

	async def _dispatch(self, ctx: _EventContext) -> None:
		try:
			if ctx.entity == "post":
				await self._handle_post(ctx)
			elif ctx.entity == "comment":
				await self._handle_comment(ctx)
			elif ctx.entity == "event":
				await self._handle_event(ctx)
			elif ctx.entity == "rsvp":
				await self._handle_rsvp(ctx)
		except Exception:  # pragma: no cover - defensive logging
			_LOG.exception("realtime_dispatcher.dispatch_failed", extra={"ctx": ctx})

	async def _handle_post(self, ctx: _EventContext) -> None:
		if not ctx.group_id:
			return
		await self._emit_with_rate_limit(
			ctx.actor_id,
			"/groups",
			lambda: socket_server.emit_group(
				ctx.group_id,
				f"post.{ctx.event}",
				{"post_id": ctx.id, "group_id": ctx.group_id},
			),
		)
		await self._enqueue_notifications(
			ctx,
			type=f"post.{ctx.event}",
			ref_id=ctx.id,
			group_id=ctx.group_id,
		)

	async def _handle_comment(self, ctx: _EventContext) -> None:
		if not ctx.post_id:
			return
		await self._emit_with_rate_limit(
			ctx.actor_id,
			"/posts",
			lambda: socket_server.emit_post(
				ctx.post_id,
				f"comment.{ctx.event}",
				{"comment_id": ctx.id, "post_id": ctx.post_id, "group_id": ctx.group_id},
			),
		)
		await self._enqueue_notifications(
			ctx,
			type=f"comment.{ctx.event}",
			ref_id=ctx.id,
			group_id=ctx.group_id,
		)

	async def _handle_event(self, ctx: _EventContext) -> None:
		if not ctx.event_id:
			return
		await self._emit_with_rate_limit(
			ctx.actor_id,
			"/events",
			lambda: socket_server.emit_event(
				ctx.event_id,
				f"event.{ctx.event}",
				{"event_id": ctx.event_id, "group_id": ctx.group_id},
			),
		)
		await self._enqueue_notifications(
			ctx,
			type=f"event.{ctx.event}",
			ref_id=ctx.event_id,
			group_id=ctx.group_id,
		)

	async def _handle_rsvp(self, ctx: _EventContext) -> None:
		if not ctx.event_id:
			return
		payload = {
			"rsvp_id": ctx.id,
			"event_id": ctx.event_id,
			"user_id": ctx.extra.get("user_id") if ctx.extra else None,
		}
		await self._emit_with_rate_limit(
			ctx.actor_id,
			"/events",
			lambda: socket_server.emit_event(ctx.event_id, f"rsvp.{ctx.event}", payload),
		)
		await self._enqueue_notifications(
			ctx,
			type=f"rsvp.{ctx.event}",
			ref_id=ctx.id,
			group_id=ctx.group_id,
		)

	async def _emit_with_rate_limit(self, actor_id: str | None, namespace: str, emitter) -> None:
		if actor_id and not await rate_limiter.allow_emit(namespace, actor_id):
			return
		await emitter()

	async def _enqueue_notifications(self, ctx: _EventContext, *, type: str, ref_id: str, group_id: str | None) -> None:
		if not ctx.group_id or not ctx.actor_id:
			return
		member_ids = await self.repo.list_member_ids(UUID(ctx.group_id))
		recipients = [str(member_id) for member_id in member_ids if str(member_id) != ctx.actor_id]
		if not recipients:
			return
		await redis_streams.enqueue_notification_build(
			type=type,
			ref_id=ref_id,
			actor_id=ctx.actor_id,
			user_ids=recipients,
			group_id=group_id,
			data={"entity": ctx.entity, "event": ctx.event},
		)
		obs_metrics.comm_notification_outbound("socket")


__all__ = ["RealtimeDispatcher"]
