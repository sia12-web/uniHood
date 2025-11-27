"""AsyncPG pool management for the backend."""

from __future__ import annotations

from typing import Optional

import asyncpg

from app.settings import settings

_pool: Optional[asyncpg.pool.Pool] = None


async def init_pool() -> asyncpg.pool.Pool:
	global _pool
	if _pool is None:
		# Force 127.0.0.1 instead of localhost to avoid IPv6 issues on Windows
		dsn = settings.postgres_url.replace("localhost", "127.0.0.1")
		_pool = await asyncpg.create_pool(
			dsn=dsn,
			min_size=0,
			max_size=5,
			ssl='disable',  # Use 'disable' string, not False boolean
		)
	return _pool


def set_pool(pool: Optional[asyncpg.pool.Pool]) -> None:
	global _pool
	_pool = pool


async def get_pool() -> asyncpg.pool.Pool:
	if _pool is None:
		await init_pool()
	assert _pool is not None
	return _pool


async def close_pool() -> None:
	global _pool
	if _pool is not None:
		await _pool.close()
		_pool = None

