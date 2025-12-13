"""Tests for the contact API endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from uuid import uuid4

# Mock the dependencies before importing the module
import sys


class MockAuthUser:
    """Mock authenticated user."""
    def __init__(self, user_id: str = None, roles: list = None):
        self.id = user_id or str(uuid4())
        self.roles = roles or []


@pytest.fixture
def mock_pool():
    """Create a mock database pool."""
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


@pytest.fixture
def sample_contact_submission():
    """Sample contact form data."""
    return {
        "name": "John Doe",
        "email": "john@university.edu",
        "subject": "Test Subject",
        "message": "This is a test message with enough characters.",
        "category": "general",
    }


@pytest.fixture
def sample_db_message():
    """Sample message from database."""
    return {
        "id": str(uuid4()),
        "user_id": None,
        "name": "John Doe",
        "email": "john@university.edu",
        "subject": "Test Subject",
        "message": "This is a test message.",
        "category": "general",
        "status": "pending",
        "admin_notes": None,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }


class TestContactSubmission:
    """Tests for contact form submission."""

    def test_valid_submission_fields(self, sample_contact_submission):
        """Test that valid submission data passes validation."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        # Should not raise
        submission = ContactSubmission(**sample_contact_submission)
        assert submission.name == "John Doe"
        assert submission.email == "john@university.edu"
        assert submission.category == "general"

    def test_invalid_email_rejected(self):
        """Test that invalid email is rejected."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        with pytest.raises(ValidationError):
            ContactSubmission(
                name="John Doe",
                email="not-an-email",
                subject="Test",
                message="This is a valid message.",
                category="general",
            )

    def test_short_message_rejected(self):
        """Test that messages under 10 characters are rejected."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        with pytest.raises(ValidationError):
            ContactSubmission(
                name="John Doe",
                email="john@test.com",
                subject="Test",
                message="Short",  # Less than 10 chars
                category="general",
            )

    def test_invalid_category_rejected(self):
        """Test that invalid category is rejected."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        with pytest.raises(ValidationError):
            ContactSubmission(
                name="John Doe",
                email="john@test.com",
                subject="Test",
                message="This is a valid message.",
                category="invalid_category",
            )

    def test_valid_categories(self):
        """Test all valid categories are accepted."""
        from app.api.contact import ContactSubmission
        
        valid_categories = ["general", "bug", "feature", "account", "abuse", "other"]
        for cat in valid_categories:
            submission = ContactSubmission(
                name="John Doe",
                email="john@test.com",
                subject="Test",
                message="This is a valid message.",
                category=cat,
            )
            assert submission.category == cat

    def test_name_max_length(self):
        """Test that name over 100 characters is rejected."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        with pytest.raises(ValidationError):
            ContactSubmission(
                name="A" * 101,  # 101 characters
                email="john@test.com",
                subject="Test",
                message="This is a valid message.",
                category="general",
            )

    def test_subject_max_length(self):
        """Test that subject over 200 characters is rejected."""
        from pydantic import ValidationError
        from app.api.contact import ContactSubmission
        
        with pytest.raises(ValidationError):
            ContactSubmission(
                name="John Doe",
                email="john@test.com",
                subject="A" * 201,  # 201 characters
                message="This is a valid message.",
                category="general",
            )


class TestUpdateContactStatus:
    """Tests for updating contact message status."""

    def test_valid_status_values(self):
        """Test all valid status values are accepted."""
        from app.api.contact import UpdateContactStatus
        
        valid_statuses = ["pending", "in_progress", "resolved", "closed"]
        for status in valid_statuses:
            update = UpdateContactStatus(status=status)
            assert update.status == status

    def test_invalid_status_rejected(self):
        """Test that invalid status is rejected."""
        from pydantic import ValidationError
        from app.api.contact import UpdateContactStatus
        
        with pytest.raises(ValidationError):
            UpdateContactStatus(status="invalid_status")

    def test_admin_notes_optional(self):
        """Test that admin_notes is optional."""
        from app.api.contact import UpdateContactStatus
        
        update = UpdateContactStatus(status="resolved")
        assert update.admin_notes is None
        
        update_with_notes = UpdateContactStatus(status="resolved", admin_notes="Contacted user via email")
        assert update_with_notes.admin_notes == "Contacted user via email"


class TestContactMessageOut:
    """Tests for contact message output schema."""

    def test_message_output_creation(self, sample_db_message):
        """Test creating a ContactMessageOut from database data."""
        from app.api.contact import ContactMessageOut
        
        msg = ContactMessageOut(
            id=sample_db_message["id"],
            user_id=sample_db_message["user_id"],
            name=sample_db_message["name"],
            email=sample_db_message["email"],
            subject=sample_db_message["subject"],
            message=sample_db_message["message"],
            category=sample_db_message["category"],
            status=sample_db_message["status"],
            created_at=sample_db_message["created_at"],
            updated_at=sample_db_message["updated_at"],
            admin_notes=sample_db_message["admin_notes"],
        )
        
        assert msg.id == sample_db_message["id"]
        assert msg.name == "John Doe"
        assert msg.status == "pending"


class TestContactListResponse:
    """Tests for contact list response schema."""

    def test_list_response_structure(self, sample_db_message):
        """Test the list response structure."""
        from app.api.contact import ContactListResponse, ContactMessageOut
        
        msg = ContactMessageOut(
            id=sample_db_message["id"],
            user_id=sample_db_message["user_id"],
            name=sample_db_message["name"],
            email=sample_db_message["email"],
            subject=sample_db_message["subject"],
            message=sample_db_message["message"],
            category=sample_db_message["category"],
            status=sample_db_message["status"],
            created_at=sample_db_message["created_at"],
            updated_at=sample_db_message["updated_at"],
            admin_notes=sample_db_message["admin_notes"],
        )
        
        response = ContactListResponse(items=[msg], total=1, has_more=False)
        
        assert len(response.items) == 1
        assert response.total == 1
        assert response.has_more is False

    def test_empty_list_response(self):
        """Test empty list response."""
        from app.api.contact import ContactListResponse
        
        response = ContactListResponse(items=[], total=0, has_more=False)
        
        assert len(response.items) == 0
        assert response.total == 0

    def test_has_more_pagination(self, sample_db_message):
        """Test has_more flag for pagination."""
        from app.api.contact import ContactListResponse, ContactMessageOut
        
        msg = ContactMessageOut(
            id=sample_db_message["id"],
            user_id=sample_db_message["user_id"],
            name=sample_db_message["name"],
            email=sample_db_message["email"],
            subject=sample_db_message["subject"],
            message=sample_db_message["message"],
            category=sample_db_message["category"],
            status=sample_db_message["status"],
            created_at=sample_db_message["created_at"],
            updated_at=sample_db_message["updated_at"],
            admin_notes=sample_db_message["admin_notes"],
        )
        
        response = ContactListResponse(items=[msg], total=100, has_more=True)
        
        assert response.has_more is True
        assert response.total == 100
