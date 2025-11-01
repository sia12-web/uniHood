"""Helpers for instrumenting Socket.IO namespaces with metrics."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from app.obs import metrics


@contextmanager
def connected(namespace: str) -> Iterator[None]:
	metrics.socket_connected(namespace)
	try:
		yield
	finally:
		metrics.socket_disconnected(namespace)


def event(namespace: str, name: str) -> None:
	metrics.socket_event(namespace, name)
