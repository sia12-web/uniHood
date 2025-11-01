import asyncio
import time
import uuid

import httpx

from app.main import app
from app.domain.proximity import service as proximity_service


async def main():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        # Monkeypatch proximity helpers to avoid Postgres requirements for this smoke
        async def _fake_privacy(user_ids):
            from app.domain.proximity.models import PrivacySettings
            return {uid: PrivacySettings(visibility="everyone", blur_distance_m=0) for uid in user_ids}

        async def _fake_friends(self_id, user_ids):
            return {uid: True for uid in user_ids}

        async def _fake_blocks(self_id, user_ids):
            return {}

        proximity_service.load_privacy = _fake_privacy  # type: ignore
        proximity_service.load_friendship_flags = _fake_friends  # type: ignore
        proximity_service.load_blocks = _fake_blocks  # type: ignore
        async def _fake_profiles(user_ids):
            return {uid: {"display_name": f"User {uid[:4]}", "handle": f"user_{uid[:4]}", "avatar_url": None} for uid in user_ids}
        proximity_service._load_user_lite = _fake_profiles  # type: ignore
        u1 = "11111111-1111-1111-1111-111111111111"
        u2 = "22222222-2222-2222-2222-222222222222"
        campus = str(uuid.uuid4())
        now = int(time.time() * 1000)

        hb1 = {
            "lat": 37.0,
            "lon": -122.0,
            "accuracy_m": 10,
            "campus_id": campus,
            "device_id": "d1",
            "ts_client": now,
        }
        r = await c.post("/presence/heartbeat", json=hb1, headers={"X-User-Id": u1, "X-Campus-Id": campus})
        print("hb1", r.status_code)

        r = await c.get("/presence/status/self", headers={"X-User-Id": u1, "X-Campus-Id": campus})
        print("status", r.status_code, r.json())

        hb2 = {
            "lat": 37.0001,
            "lon": -122.0001,
            "accuracy_m": 10,
            "campus_id": campus,
            "device_id": "d2",
            "ts_client": now,
        }
        r = await c.post("/presence/heartbeat", json=hb2, headers={"X-User-Id": u2, "X-Campus-Id": campus})
        print("hb2", r.status_code)

        r = await c.get(
            "/proximity/nearby",
            params={"campus_id": campus, "radius_m": 200},
            headers={"X-User-Id": u1, "X-Campus-Id": campus},
        )
        data = r.json()
        print("nearby", r.status_code, len(data.get("items", [])))


if __name__ == "__main__":
    asyncio.run(main())
