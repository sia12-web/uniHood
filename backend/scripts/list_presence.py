import asyncio
import json

import asyncpg
import redis.asyncio as redis


DSN = "postgresql://postgres:postgres@localhost:5432/divan"
TARGET_HANDLES = ["sia123", "lilylily"]


async def main() -> None:
	conn = await asyncpg.connect(DSN)
	try:
		rows = await conn.fetch(
			"SELECT id, handle, campus_id FROM users WHERE handle = ANY($1)", TARGET_HANDLES
		)
	finally:
		await conn.close()
	if not rows:
		print("No users found")
		return
	client = redis.Redis.from_url("redis://localhost:6379/0")
	results = []
	for row in rows:
		user_id = str(row["id"])
		presence = await client.hgetall(f"presence:{user_id}")
		results.append(
			{
				"handle": row["handle"],
				"user_id": user_id,
				"campus_id": str(row["campus_id"]),
				"presence": {k.decode(): v.decode() for k, v in presence.items()},
			}
		)
	await client.aclose()
	print(json.dumps(results, indent=2))


if __name__ == "__main__":
	asyncio.run(main())