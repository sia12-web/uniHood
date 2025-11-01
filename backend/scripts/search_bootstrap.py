"""CLI entrypoint to provision communities search assets."""

from __future__ import annotations

import asyncio

from app.communities.search.bootstrap import SearchBootstrapper


async def _run() -> None:
	bootstrapper = SearchBootstrapper()
	await bootstrapper.install_all()


def main() -> None:
	asyncio.run(_run())


if __name__ == "__main__":
	main()
