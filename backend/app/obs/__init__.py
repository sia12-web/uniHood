"""Observability package bootstrap."""

from __future__ import annotations

from typing import Optional

import socketio
from fastapi import FastAPI

from app.obs import logging as obs_logging
from app.obs import middleware, tracing
from app.settings import settings

_initialised = False


def init(app: FastAPI, sio: Optional[socketio.AsyncServer] = None) -> None:
	global _initialised
	if _initialised:
		return
	if not settings.obs_enabled:
		return
	obs_logging.configure_logging()
	middleware.install(app)
	tracing.init_tracing(app)
	if sio is not None:
		# Socket instrumentation hooks live with namespace logic for now.
		_ = sio
	_initialised = True


__all__ = ["init"]
