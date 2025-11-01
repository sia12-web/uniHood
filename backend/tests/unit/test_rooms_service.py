from dataclasses import dataclass

import pytest
import pytest_asyncio

from app.domain.rooms.chat_service import RoomChatService, reset_message_store
from app.domain.rooms import policy
from app.domain.rooms.schemas import (
    JoinByCodeRequest,
    ReadRequest,
    RoomCreateRequest,
    RoomMessageSendRequest,
)
from app.domain.rooms.service import RoomService, reset_memory_state
from app.infra.auth import AuthenticatedUser


@pytest_asyncio.fixture(autouse=True)
async def reset_state():
    await reset_memory_state()
    await reset_message_store()
    yield


@dataclass
class UserFactory:
    id: str
    campus_id: str = "campus-1"

    def to_user(self) -> AuthenticatedUser:
        return AuthenticatedUser(id=self.id, campus_id=self.campus_id)


@pytest.mark.asyncio
async def test_create_room_and_join_by_code(fake_redis):
    room_service = RoomService()
    user_owner = UserFactory("owner").to_user()
    payload = RoomCreateRequest(name="Study Group", preset="4-6", visibility="link")
    summary = await room_service.create_room(user_owner, payload)
    assert summary.join_code is not None
    join_code = summary.join_code

    joiner = UserFactory("member").to_user()
    join_summary = await room_service.join_by_code(joiner, JoinByCodeRequest(join_code=join_code))
    assert join_summary.id == summary.id
    assert join_summary.role == "member"
    assert join_summary.join_code is None


@pytest.mark.asyncio
async def test_leave_room_reject_owner_without_transfer(fake_redis):
    room_service = RoomService()
    owner = UserFactory("owner").to_user()
    room = await room_service.create_room(owner, RoomCreateRequest(name="Room", preset="2-4", visibility="link"))
    other = UserFactory("member").to_user()
    await room_service.join_room(other, room.id)
    with pytest.raises(policy.RoomPolicyError):
        await room_service.leave_room(owner, room.id)


@pytest.mark.asyncio
async def test_send_message_and_history(fake_redis):
    room_service = RoomService()
    chat_service = RoomChatService(room_service=room_service)
    owner = UserFactory("owner").to_user()
    member = UserFactory("member").to_user()
    room = await room_service.create_room(owner, RoomCreateRequest(name="Group", preset="4-6", visibility="link"))
    await room_service.join_room(member, room.id)

    msg = await chat_service.send_message(
        owner,
        room.id,
        RoomMessageSendRequest(client_msg_id="msg00001", kind="text", content="Hello"),
    )
    assert msg.seq == 1

    history = await chat_service.history(owner, room.id, cursor=None, direction="backward", limit=10)
    assert len(history.items) == 1
    assert history.items[0].content == "Hello"

    await chat_service.mark_read(member, room.id, ReadRequest(up_to_seq=1))
