import pytest


@pytest.mark.asyncio
async def test_rooms_full_flow(api_client):
    owner_headers = {"X-User-Id": "11111111-0000-0000-0000-000000000001", "X-Campus-Id": "campus-a"}
    member_headers = {"X-User-Id": "22222222-0000-0000-0000-000000000002", "X-Campus-Id": "campus-a"}

    create_payload = {
        "name": "Evening Study",
        "preset": "4-6",
        "visibility": "link",
    }
    response = await api_client.post("/rooms/create", json=create_payload, headers=owner_headers)
    assert response.status_code == 200
    room_summary = response.json()
    assert room_summary["join_code"] is not None
    room_id = room_summary["id"]
    join_code = room_summary["join_code"]

    list_response = await api_client.get("/rooms/my", headers=owner_headers)
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 1
    assert items[0]["join_code"] == join_code

    join_response = await api_client.post(
        "/rooms/join/by-code",
        json={"join_code": join_code},
        headers=member_headers,
    )
    assert join_response.status_code == 200
    join_summary = join_response.json()
    assert join_summary["id"] == room_id
    assert join_summary["join_code"] is None

    rotate_response = await api_client.post(f"/rooms/{room_id}/invite-code/rotate", headers=owner_headers)
    assert rotate_response.status_code == 200
    rotated = rotate_response.json()
    assert rotated["join_code"] is not None
    assert rotated["join_code"] != join_code

    send_payload = {"client_msg_id": "msg00001", "kind": "text", "content": "Hello team"}
    send_response = await api_client.post(
        f"/rooms/{room_id}/send",
        json=send_payload,
        headers=owner_headers,
    )
    assert send_response.status_code == 200
    message = send_response.json()
    assert message["seq"] == 1
    assert message["content"] == "Hello team"

    history_response = await api_client.get(f"/rooms/{room_id}/history", headers=member_headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert history["items"][0]["content"] == "Hello team"

    read_response = await api_client.post(
        f"/rooms/{room_id}/read",
        json={"up_to_seq": 1},
        headers=member_headers,
    )
    assert read_response.status_code == 200

    mute_response = await api_client.post(
        f"/rooms/{room_id}/members/{member_headers['X-User-Id']}/mute",
        json={"on": True},
        headers=owner_headers,
    )
    assert mute_response.status_code == 200

    detail_response = await api_client.get(f"/rooms/{room_id}", headers=owner_headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    roster = {member["user_id"]: member for member in detail["members"]}
    assert roster[member_headers["X-User-Id"]]["muted"] is True

    kick_response = await api_client.post(
        f"/rooms/{room_id}/members/{member_headers['X-User-Id']}/kick",
        headers=owner_headers,
    )
    assert kick_response.status_code == 200

    detail_after_kick = await api_client.get(f"/rooms/{room_id}", headers=owner_headers)
    assert detail_after_kick.status_code == 200
    members_after_kick = [member["user_id"] for member in detail_after_kick.json()["members"]]
    assert member_headers["X-User-Id"] not in members_after_kick


@pytest.mark.asyncio
async def test_join_by_code_rejects_cross_campus(api_client):
    owner_headers = {"X-User-Id": "33333333-0000-0000-0000-000000000003", "X-Campus-Id": "campus-b"}
    create_payload = {
        "name": "Campus B Room",
        "preset": "2-4",
        "visibility": "link",
    }
    response = await api_client.post("/rooms/create", json=create_payload, headers=owner_headers)
    assert response.status_code == 200
    join_code = response.json()["join_code"]

    outsider_headers = {"X-User-Id": "44444444-0000-0000-0000-000000000004", "X-Campus-Id": "campus-c"}
    join_response = await api_client.post(
        "/rooms/join/by-code",
        json={"join_code": join_code},
        headers=outsider_headers,
    )
    assert join_response.status_code == 403
