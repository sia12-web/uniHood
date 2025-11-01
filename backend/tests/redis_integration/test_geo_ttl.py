import pytest

from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_georesults_respect_presence_ttl():
	campus_key = "geo:presence:test-campus"
	await redis_client.geoadd(
		campus_key,
		{
			"user-a": (-122.0, 37.0),
			"user-b": (-122.0001, 37.0001),
		},
	)
	await redis_client.hset("presence:user-a", mapping={"lat": 37.0, "lon": -122.0, "ts": 123})
	await redis_client.hset("presence:user-b", mapping={"lat": 37.0001, "lon": -122.0001, "ts": 123})
	await redis_client.expire("presence:user-a", 90)
	await redis_client.expire("presence:user-b", 1)

	results = await redis_client.geosearch(
		campus_key,
		longitude=-122.0,
		latitude=37.0,
		radius=200,
		unit="m",
		withdist=True,
		sort="ASC",
		count=5,
	)
	assert [member for member, _ in results] == ["user-a", "user-b"]

	await redis_client.delete("presence:user-b")
	results_after = await redis_client.geosearch(
		campus_key,
		longitude=-122.0,
		latitude=37.0,
		radius=200,
		unit="m",
		withdist=True,
		sort="ASC",
		count=5,
	)
	assert [member for member, _ in results_after] == ["user-a"]
