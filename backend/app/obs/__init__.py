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


from app.obs import metrics
# Fail-safe to ensure inc_identity_reject is always available
if not hasattr(metrics, "inc_identity_reject"):
	def _mock_inc_id_reject(reason: str) -> None:
		pass
	metrics.inc_identity_reject = _mock_inc_id_reject

__all__ = ["init", "metrics"]
