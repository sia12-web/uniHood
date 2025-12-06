"""Unit tests for legal holds and request logging."""

from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.domain.legal.holds import (
    HoldService,
    CreateHoldRequest,
    LegalHold,
    is_user_under_hold,
    get_users_under_hold,
)
from app.domain.legal.requests import (
    RequestLogService,
    LogRequestInput,
    CompleteRequestInput,
    LegalRequestType,
)


class FakeConnection:
    """Fake asyncpg connection for testing."""

    def __init__(self):
        self.executed = []
        self.fetched = []
        self._return_values = {}

    def set_return(self, query_pattern: str, value):
        self._return_values[query_pattern] = value

    async def execute(self, query, *args):
        self.executed.append((query, args))
        return "OK"

    async def fetch(self, query, *args):
        self.fetched.append((query, args))
        for pattern, value in self._return_values.items():
            if pattern in query:
                return value
        return []

    async def fetchrow(self, query, *args):
        rows = await self.fetch(query, *args)
        return rows[0] if rows else None

    async def fetchval(self, query, *args):
        for pattern, value in self._return_values.items():
            if pattern in query:
                return value
        return None


class FakePool:
    def __init__(self, conn: FakeConnection):
        self._conn = conn

    def acquire(self):
        return self

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


@pytest.fixture
def fake_conn():
    return FakeConnection()


@pytest.fixture
def fake_pool(fake_conn):
    return FakePool(fake_conn)


class TestHoldService:
    """Tests for HoldService."""

    @pytest.mark.asyncio
    async def test_create_hold(self, fake_pool, fake_conn):
        """Test creating a legal hold."""
        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            with patch("app.domain.legal.holds.obs_metrics"):
                service = HoldService()
                user_ids = [uuid4(), uuid4()]
                request = CreateHoldRequest(
                    request_id="LR-2024-001",
                    user_ids=user_ids,
                    authority="Test Court",
                    reason="Test hold",
                    expires_in_days=90,
                )

                hold = await service.create_hold(request, created_by="admin@test.com")

                assert hold.request_id == "LR-2024-001"
                assert hold.authority == "Test Court"
                assert hold.user_ids == user_ids
                assert hold.released_at is None
                assert len(fake_conn.executed) == 1

    @pytest.mark.asyncio
    async def test_release_hold(self, fake_pool, fake_conn):
        """Test releasing a legal hold."""
        hold_id = uuid4()
        now = datetime.now(timezone.utc)
        fake_conn.set_return("UPDATE legal_holds", [{
            "id": hold_id,
            "request_id": "LR-2024-001",
            "user_ids": [uuid4()],
            "authority": "Test Court",
            "reason": None,
            "created_by": "admin",
            "created_at": now,
            "expires_at": now + timedelta(days=90),
            "released_at": now,
            "released_by": "admin",
            "notes": None,
        }])

        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            with patch("app.domain.legal.holds.obs_metrics"):
                service = HoldService()
                hold = await service.release_hold(hold_id, released_by="admin")

                assert hold is not None
                assert hold.released_at is not None

    @pytest.mark.asyncio
    async def test_list_active_holds(self, fake_pool, fake_conn):
        """Test listing active holds."""
        now = datetime.now(timezone.utc)
        fake_conn.set_return("SELECT id", [{
            "id": uuid4(),
            "request_id": "LR-2024-001",
            "user_ids": [uuid4()],
            "authority": "Test Court",
            "reason": None,
            "created_by": "admin",
            "created_at": now,
            "expires_at": now + timedelta(days=90),
            "released_at": None,
            "released_by": None,
            "notes": None,
        }])

        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            service = HoldService()
            holds = await service.list_active_holds()

            assert len(holds) == 1
            assert holds[0].released_at is None


class TestUserHoldCheck:
    """Tests for user hold checking functions."""

    @pytest.mark.asyncio
    async def test_is_user_under_hold_true(self, fake_pool, fake_conn):
        """Test checking if user is under hold - true case."""
        fake_conn.set_return("SELECT EXISTS", True)

        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            result = await is_user_under_hold(uuid4())
            assert result is True

    @pytest.mark.asyncio
    async def test_is_user_under_hold_false(self, fake_pool, fake_conn):
        """Test checking if user is under hold - false case."""
        fake_conn.set_return("SELECT EXISTS", False)

        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            result = await is_user_under_hold(uuid4())
            assert result is False

    @pytest.mark.asyncio
    async def test_get_users_under_hold(self, fake_pool, fake_conn):
        """Test getting all users under hold."""
        user1, user2 = uuid4(), uuid4()
        fake_conn.set_return("unnest", [
            {"user_id": user1},
            {"user_id": user2},
        ])

        with patch("app.domain.legal.holds.get_pool", return_value=fake_pool):
            users = await get_users_under_hold()
            assert len(users) == 2
            assert user1 in users
            assert user2 in users


class TestRequestLogService:
    """Tests for RequestLogService."""

    @pytest.mark.asyncio
    async def test_log_request(self, fake_pool, fake_conn):
        """Test logging a legal request."""
        with patch("app.domain.legal.requests.get_pool", return_value=fake_pool):
            service = RequestLogService()
            input = LogRequestInput(
                request_type=LegalRequestType.SUBPOENA,
                authority="Test Court",
                reference_number="SUB-2024-001",
                user_ids=[uuid4()],
                data_types=["messages", "profile"],
            )

            request = await service.log_request(input, handled_by="legal@test.com")

            assert request.request_type == LegalRequestType.SUBPOENA
            assert request.authority == "Test Court"
            assert len(fake_conn.executed) == 1

    @pytest.mark.asyncio
    async def test_complete_request(self, fake_pool, fake_conn):
        """Test completing a legal request."""
        request_id = uuid4()
        now = datetime.now(timezone.utc)
        fake_conn.set_return("UPDATE legal_request_log", [{
            "id": request_id,
            "request_type": "subpoena",
            "authority": "Test Court",
            "reference_number": "SUB-2024-001",
            "received_at": now,
            "responded_at": now,
            "user_ids": [],
            "data_types": [],
            "data_produced": {"records": 10},
            "notes": None,
            "handled_by": "legal@test.com",
            "created_at": now,
        }])

        with patch("app.domain.legal.requests.get_pool", return_value=fake_pool):
            service = RequestLogService()
            input = CompleteRequestInput(
                data_produced={"records": 10},
            )

            request = await service.complete_request(request_id, input)

            assert request is not None
            assert request.responded_at is not None

    @pytest.mark.asyncio
    async def test_list_requests(self, fake_pool, fake_conn):
        """Test listing legal requests."""
        now = datetime.now(timezone.utc)
        fake_conn.set_return("SELECT id", [{
            "id": uuid4(),
            "request_type": "subpoena",
            "authority": "Test Court",
            "reference_number": None,
            "received_at": now,
            "responded_at": None,
            "user_ids": [],
            "data_types": [],
            "data_produced": None,
            "notes": None,
            "handled_by": "legal@test.com",
            "created_at": now,
        }])

        with patch("app.domain.legal.requests.get_pool", return_value=fake_pool):
            service = RequestLogService()
            requests = await service.list_requests(limit=50)

            assert len(requests) == 1

    @pytest.mark.asyncio
    async def test_generate_compliance_report(self, fake_pool, fake_conn):
        """Test generating compliance report."""
        fake_conn.set_return("GROUP BY", [
            {"request_type": "subpoena", "count": 5},
            {"request_type": "warrant", "count": 2},
        ])
        fake_conn.set_return("COUNT(*) as total", {
            "total": 7,
            "responded": 6,
            "avg_response_seconds": 86400,
        })
        fake_conn.set_return("COUNT(DISTINCT", 10)

        with patch("app.domain.legal.requests.get_pool", return_value=fake_pool):
            service = RequestLogService()
            start = datetime.now(timezone.utc) - timedelta(days=30)
            end = datetime.now(timezone.utc)

            report = await service.generate_compliance_report(start, end)

            assert "total_requests" in report
            assert "requests_by_type" in report
