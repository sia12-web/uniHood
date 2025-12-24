import uuid

import pytest

from app.api import leaderboards as leaderboards_api
from app.domain.leaderboards.schemas import MySummarySchema, StreakSummarySchema


@pytest.mark.asyncio
async def test_leaderboard_endpoint_returns_rows(api_client, fake_redis, monkeypatch):
	campus_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	key = "lb:z:overall:daily:{campus}:{ymd}".format(campus=campus_id, ymd=20251024)
	user_a = "11111111-1111-1111-1111-111111111111"
	user_b = "22222222-2222-2222-2222-222222222222"
	await fake_redis.zadd(key, {user_a: 120.5, user_b: 95.0})

	async def fake_fetch_names(user_ids):
		return {
			uid: {"display_name": f"User {uid[:4]}", "handle": f"handle_{uid[:4]}", "avatar_url": None}
			for uid in user_ids
		}
	monkeypatch.setattr(leaderboards_api._service, "_fetch_user_display_names", fake_fetch_names)

	response = await api_client.get(f"/leaderboards/overall?campus_id={campus_id}&ymd=20251024")
	assert response.status_code == 200
	payload = response.json()
	assert payload["scope"] == "overall"
	assert payload["period"] == "daily"
	assert payload["campus_id"] == campus_id
	assert [row["user_id"] for row in payload["items"]] == [user_a, user_b]
	assert [row["rank"] for row in payload["items"]] == [1, 2]


@pytest.mark.asyncio

async def test_my_summary_endpoint(monkeypatch, api_client):
	user_id = "33333333-3333-3333-3333-333333333333"
	campus_id_str = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

	async def fake_my_summary(*, user_id: uuid.UUID, campus_id: uuid.UUID | None, ymd: int | None = None):
		campus_value = campus_id or uuid.UUID(campus_id_str)
		return MySummarySchema(
			ymd=ymd or 20251024,
			campus_id=campus_value,
			ranks={"overall": 5, "social": None, "engagement": None, "popularity": None},
			scores={"overall": 99.5, "social": None, "engagement": None, "popularity": None},
			streak=StreakSummarySchema(current=7, best=12, last_active_ymd=20251023),
			badges=[],
		)

	monkeypatch.setattr(leaderboards_api._service, "get_my_summary", fake_my_summary)

	response = await api_client.get("/leaderboards/me/summary", headers={"X-User-Id": user_id, "X-Campus-Id": campus_id_str})
	assert response.status_code == 200
	payload = response.json()
	assert payload["ranks"]["overall"] == 5
	assert payload["streak"]["current"] == 7


@pytest.mark.asyncio
async def test_streak_summary_endpoint(monkeypatch, api_client):
	target_user = "44444444-4444-4444-4444-444444444444"

	async def fake_streak(user_id: uuid.UUID):
		assert str(user_id) == target_user
		return StreakSummarySchema(current=3, best=10, last_active_ymd=20251024)

	monkeypatch.setattr(leaderboards_api._service, "get_streak_summary", fake_streak)

	response = await api_client.get(f"/leaderboards/streaks/{target_user}")
	assert response.status_code == 200
	payload = response.json()
	assert payload["current"] == 3
	assert payload["best"] == 10
