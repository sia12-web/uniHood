from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
import pytest_asyncio

from app.communities.domain import models
from app.communities.domain.rsvp_service import RSVPService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class _FakeTransaction:
	async def __aenter__(self):
		return None

	async def __aexit__(self, exc_type, exc, tb):
		return False


class _FakeAcquire:
	def __init__(self, conn):
		self._conn = conn

	async def __aenter__(self):
		return self._conn

	async def __aexit__(self, exc_type, exc, tb):
		return False


class _FakeConnection:
	def transaction(self):
		return _FakeTransaction()


class _FakePool:
	def __init__(self, conn):
		self._conn = conn

	def acquire(self):
		return _FakeAcquire(self._conn)


class _FakeRepo:
	def __init__(self, *, capacity: int, going: int, waitlisted: int) -> None:
		now = datetime.now(timezone.utc)
		self.group_id = uuid4()
		self.event_id = uuid4()
		self.group = models.Group(
			id=self.group_id,
			campus_id=None,
			name="Test Group",
			slug="test-group",
			description="",
			visibility="public",
			tags=[],
			avatar_key=None,
			cover_key=None,
			is_locked=False,
			created_by=uuid4(),
			created_at=now,
			updated_at=now,
			deleted_at=None,
		)
		self.event = models.Event(
			id=self.event_id,
			group_id=self.group_id,
			campus_id=None,
			title="Board Games",
			description="",
			venue_id=None,
			start_at=now + timedelta(days=1),
			end_at=now + timedelta(days=1, hours=2),
			all_day=False,
			capacity=capacity,
			visibility="public",
			rrule=None,
			allow_guests=False,
			created_by=uuid4(),
			created_at=now,
			updated_at=now,
			deleted_at=None,
		)
		self.counter = models.EventCounter(
			event_id=self.event_id,
			going=going,
			waitlisted=waitlisted,
			interested=0,
			updated_at=now,
		)
		self.rsvps: dict[tuple[UUID, UUID], models.EventRSVP] = {}
		self.members: dict[tuple[UUID, UUID], models.GroupMember] = {}

	async def get_event_with_counter(
		self, event_id: UUID, *, conn=None, for_update=False
	):
		if event_id != self.event_id:
			return None
		return self.event, self.counter

	async def get_group(self, group_id: UUID):
		return self.group if group_id == self.group_id else None

	async def get_member(self, group_id: UUID, user_id: UUID):
		return self.members.get((group_id, user_id))

	async def get_event_rsvp(self, *, conn, event_id: UUID, user_id: UUID):
		return self.rsvps.get((event_id, user_id))

	async def upsert_event_rsvp(
		self,
		*,
		conn,
		event_id: UUID,
		user_id: UUID,
		status: str,
		guests: int,
	):
		now = datetime.now(timezone.utc)
		key = (event_id, user_id)
		existing = self.rsvps.get(key)
		if existing:
			existing.status = status
			existing.guests = guests
			existing.updated_at = now
			self.rsvps[key] = existing
			return existing
		new_rsvp = models.EventRSVP(
			id=uuid4(),
			event_id=event_id,
			user_id=user_id,
			status=status,
			guests=guests,
			created_at=now,
			updated_at=now,
		)
		self.rsvps[key] = new_rsvp
		return new_rsvp

	async def adjust_event_counter(
		self,
		event_id: UUID,
		*,
		conn,
		going_delta: int = 0,
		waitlisted_delta: int = 0,
		interested_delta: int = 0,
	):
		updated = models.EventCounter(
			event_id=event_id,
			going=max(0, self.counter.going + going_delta),
			waitlisted=max(0, self.counter.waitlisted + waitlisted_delta),
			interested=max(0, self.counter.interested + interested_delta),
			updated_at=datetime.now(timezone.utc),
		)
		self.counter = updated
		return updated

	async def list_waitlisted_rsvps(self, event_id: UUID, *, conn, limit: int):
		items = [r for r in self.rsvps.values() if r.event_id == event_id and r.status == "waitlisted"]
		items.sort(key=lambda r: r.created_at)
		return items[:limit]

	async def delete_event_rsvp(self, *, conn, event_id: UUID, user_id: UUID):
		return self.rsvps.pop((event_id, user_id), None)

	async def enqueue_outbox(self, **kwargs):
		return None

	async def list_events_waitlist_candidates(self, *, limit: int, conn=None):
		if self.counter.waitlisted > 0 and self.counter.going < (self.event.capacity or 0):
			return [self.event_id]
		return []


@pytest_asyncio.fixture
async def fake_pool(monkeypatch):
	connection = _FakeConnection()
	pool = _FakePool(connection)

	async def _get_pool():
		return pool

	monkeypatch.setattr("app.communities.domain.rsvp_service.get_pool", _get_pool)
	return pool


async def _noop_async(*args, **kwargs):
	return None


def _noop(*args, **kwargs):
	return None


@pytest.mark.asyncio
async def test_rsvp_waitlist_when_capacity_full(monkeypatch, fake_pool):
	repo = _FakeRepo(capacity=2, going=2, waitlisted=0)
	service = RSVPService(repository=repo)
	monkeypatch.setattr(service, "_enqueue_outbox", _noop_async)
	monkeypatch.setattr("app.communities.infra.redis_streams.publish_rsvp_event", _noop_async)
	monkeypatch.setattr("app.obs.metrics.inc_event_rsvp_updated", _noop)
	monkeypatch.setattr("app.obs.metrics.inc_event_waitlist_promotions", _noop)
	auth_user = AuthenticatedUser(id=str(uuid4()), campus_id="c1")
	response = await service.upsert_rsvp(
		auth_user,
		repo.event_id,
		dto.RSVPUpsertRequest(status="going", guests=0),
	)

	assert response.status == "waitlisted"
	assert repo.counter.waitlisted == 1
	assert repo.counter.going == 2


@pytest.mark.asyncio
async def test_rsvp_decline_promotes_waitlist(monkeypatch, fake_pool):
	repo = _FakeRepo(capacity=2, going=2, waitlisted=1)
	waitlisted_user = uuid4()
	now = datetime.now(timezone.utc)
	repo.rsvps[(repo.event_id, waitlisted_user)] = models.EventRSVP(
		id=uuid4(),
		event_id=repo.event_id,
		user_id=waitlisted_user,
		status="waitlisted",
		guests=0,
		created_at=now - timedelta(minutes=5),
		updated_at=now - timedelta(minutes=5),
	)
	going_user = uuid4()
	repo.rsvps[(repo.event_id, going_user)] = models.EventRSVP(
		id=uuid4(),
		event_id=repo.event_id,
		user_id=going_user,
		status="going",
		guests=0,
		created_at=now - timedelta(minutes=10),
		updated_at=now - timedelta(minutes=10),
	)
	moderator_id = uuid4()
	repo.members[(repo.group_id, moderator_id)] = models.GroupMember(
		id=uuid4(),
		group_id=repo.group_id,
		user_id=moderator_id,
		role="moderator",
		joined_at=now,
		muted_until=None,
		is_banned=False,
		created_at=now,
		updated_at=now,
	)
	moderator_user = AuthenticatedUser(id=str(moderator_id), campus_id="c1")
	service = RSVPService(repository=repo)
	monkeypatch.setattr(service, "_enqueue_outbox", _noop_async)
	monkeypatch.setattr("app.communities.infra.redis_streams.publish_rsvp_event", _noop_async)
	monkeypatch.setattr("app.obs.metrics.inc_event_rsvp_updated", _noop)
	monkeypatch.setattr("app.obs.metrics.inc_event_waitlist_promotions", _noop)

	await service.admin_update_rsvp(
		moderator_user,
		repo.event_id,
		going_user,
		dto.RSVPAdminUpdateRequest(status="declined"),
	)

	promoted = repo.rsvps[(repo.event_id, waitlisted_user)]
	assert promoted.status == "going"
	assert repo.counter.waitlisted == 0
	assert repo.counter.going == 2

