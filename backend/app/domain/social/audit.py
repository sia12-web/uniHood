"""Audit helpers for invites & friendships."""

from __future__ import annotations

from typing import Dict

from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics


async def log_invite_event(event: str, fields: Dict[str, str]) -> None:
	payload = {"event": event, **fields}
	await redis_client.xadd("x:invites.events", payload)


async def log_friend_event(event: str, fields: Dict[str, str]) -> None:
	payload = {"event": event, **fields}
	await redis_client.xadd("x:friendships.events", payload)


def inc_invite_sent(result: str) -> None:
	obs_metrics.inc_invite_sent(result)


def inc_invite_accept() -> None:
	obs_metrics.inc_invite_accept()


def inc_block(action: str) -> None:
	obs_metrics.inc_block(action)


def inc_send_reject(reason: str) -> None:
	obs_metrics.inc_invite_send_reject(reason)
