from types import SimpleNamespace

import pytest

from app.domain.chat.models import ChatMessage, ConversationKey, attach_iterable
from app.domain.chat.service import ChatService
from app.infra.auth import AuthenticatedUser


class FakeRepo:
    def __init__(self) -> None:
        self.last_body: str | None = None

    async def create_message(
        self,
        conversation: ConversationKey,
        sender_id: str,
        recipient_id: str,
        body: str,
        attachments_meta,
        client_msg_id: str,
        created_at,
    ) -> ChatMessage:
        self.last_body = body
        return ChatMessage(
            message_id="msg-1",
            client_msg_id=client_msg_id,
            conversation_id=conversation.conversation_id,
            seq=1,
            sender_id=sender_id,
            recipient_id=recipient_id,
            body=body,
            attachments=attach_iterable(attachments_meta or []),
            created_at=created_at,
        )


@pytest.mark.asyncio
async def test_send_message_shadowed(monkeypatch):
    fake_repo = FakeRepo()
    service = ChatService(repository=fake_repo)

    # Ensure attachments stay simple during the test.
    monkeypatch.setattr("app.domain.chat.attachments.normalize_attachments", lambda _: [])

    emitted_to_recipient: list = []
    emitted_echo: list = []

    async def stub_emit_message(recipient_id, payload):
        emitted_to_recipient.append((recipient_id, payload))

    async def stub_emit_echo(sender_id, payload):
        emitted_echo.append((sender_id, payload))

    async def stub_emit_delivery(*args, **kwargs):
        return None

    async def stub_mark_delivered(*_, **__):
        return 1

    monkeypatch.setattr("app.domain.chat.sockets.emit_message", stub_emit_message)
    monkeypatch.setattr("app.domain.chat.sockets.emit_echo", stub_emit_echo)
    monkeypatch.setattr("app.domain.chat.sockets.emit_delivery", stub_emit_delivery)
    monkeypatch.setattr("app.domain.chat.delivery.mark_delivered", stub_mark_delivered)

    from app.moderation.middleware.write_gate_v2 import WriteContext

    class StubGate:
        async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
            ctx.shadow = True
            return ctx

    monkeypatch.setattr("app.moderation.domain.container.get_write_gate", lambda: StubGate())

    user = AuthenticatedUser(id="alice", campus_id="campus-1")
    payload = SimpleNamespace(to_user_id="bob", body="Hello", attachments=None, client_msg_id="c123")

    response = await service.send_message(user, payload)

    assert fake_repo.last_body == "Hello"
    assert response.moderation == {"shadowed": True}
    assert emitted_to_recipient == []
    assert len(emitted_echo) == 1


@pytest.mark.asyncio
async def test_send_message_strips_links(monkeypatch):
    fake_repo = FakeRepo()
    service = ChatService(repository=fake_repo)

    monkeypatch.setattr("app.domain.chat.attachments.normalize_attachments", lambda _: [])

    emits: list = []

    async def stub_emit_message(recipient_id, payload):
        emits.append((recipient_id, payload))

    async def stub_emit_echo(sender_id, payload):
        emits.append((sender_id, payload))

    async def stub_emit_delivery(*args, **kwargs):
        return None

    async def stub_mark_delivered(*_, **__):
        return 1

    monkeypatch.setattr("app.domain.chat.sockets.emit_message", stub_emit_message)
    monkeypatch.setattr("app.domain.chat.sockets.emit_echo", stub_emit_echo)
    monkeypatch.setattr("app.domain.chat.sockets.emit_delivery", stub_emit_delivery)
    monkeypatch.setattr("app.domain.chat.delivery.mark_delivered", stub_mark_delivered)

    from app.moderation.middleware.write_gate_v2 import WriteContext

    class StubGate:
        async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
            ctx.strip_links = True
            ctx.metadata["link_cooloff"] = True
            return ctx

    monkeypatch.setattr("app.moderation.domain.container.get_write_gate", lambda: StubGate())

    user = AuthenticatedUser(id="alice", campus_id="campus-1")
    payload = SimpleNamespace(
        to_user_id="bob",
        body="Check https://example.com",
        attachments=None,
        client_msg_id="c123",
    )

    response = await service.send_message(user, payload)

    assert fake_repo.last_body == "Check [link removed]"
    assert response.body == "Check [link removed]"
    assert response.moderation == {"links_stripped": True, "link_cooloff": True}
    # One emit to recipient and one echo back to sender.
    recipients = {item[0] for item in emits}
    assert "bob" in recipients
    assert "alice" in recipients
