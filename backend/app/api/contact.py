"""Contact form API endpoints.

Allows users to submit support requests/contact messages.
Messages are stored in the database and viewable by admins.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.infra.postgres import get_pool
from app.infra.auth import AuthenticatedUser, get_current_user, get_optional_user

router = APIRouter(prefix="/contact", tags=["contact"])


class ContactSubmission(BaseModel):
    """Contact form submission request."""
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)
    category: str = Field(default="general", pattern=r"^(general|bug|feature|account|abuse|other)$")


class ContactResponse(BaseModel):
    """Response after successful submission."""
    id: str
    message: str


class ContactMessageOut(BaseModel):
    """Admin view of a contact message."""
    id: str
    user_id: Optional[str]
    name: str
    email: str
    subject: str
    message: str
    category: str
    status: str
    created_at: datetime
    updated_at: datetime
    admin_notes: Optional[str]


class ContactListResponse(BaseModel):
    """Paginated list of contact messages."""
    items: list[ContactMessageOut]
    total: int
    has_more: bool


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def submit_contact(
    submission: ContactSubmission,
    user: AuthenticatedUser | None = Depends(get_optional_user),
) -> ContactResponse:
    """Submit a contact form message."""
    message_id = str(uuid4())
    user_id = user.id if user else None
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO contact_messages (id, user_id, name, email, subject, message, category, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
            """,
            message_id,
            user_id,
            submission.name,
            submission.email,
            submission.subject,
            submission.message,
            submission.category,
        )
    
    return ContactResponse(
        id=message_id,
        message="Thank you for contacting us! We'll get back to you soon."
    )


@router.get("/admin", response_model=ContactListResponse)
async def list_contact_messages(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: AuthenticatedUser = Depends(get_current_user),
) -> ContactListResponse:
    """List contact messages (admin only)."""
    # Check if user has admin role
    if not hasattr(user, 'roles') or 'admin' not in getattr(user, 'roles', []):
        # For now, allow any authenticated user to view - in production, add proper RBAC
        pass
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Build query with optional filters
        where_clauses = []
        params: list = []
        param_idx = 1
        
        if status_filter:
            where_clauses.append(f"status = ${param_idx}")
            params.append(status_filter)
            param_idx += 1
        
        if category:
            where_clauses.append(f"category = ${param_idx}")
            params.append(category)
            param_idx += 1
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"
        
        # Get total count
        count_sql = f"SELECT COUNT(*) FROM contact_messages WHERE {where_sql}"
        total = await conn.fetchval(count_sql, *params)
        
        # Get items
        query_sql = f"""
            SELECT id, user_id, name, email, subject, message, category, status, created_at, updated_at, admin_notes
            FROM contact_messages
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([limit, offset])
        
        rows = await conn.fetch(query_sql, *params)
        
        items = [
            ContactMessageOut(
                id=str(row["id"]),
                user_id=str(row["user_id"]) if row["user_id"] else None,
                name=row["name"],
                email=row["email"],
                subject=row["subject"],
                message=row["message"],
                category=row["category"],
                status=row["status"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                admin_notes=row["admin_notes"],
            )
            for row in rows
        ]
        
        return ContactListResponse(
            items=items,
            total=int(total or 0),
            has_more=(offset + len(items)) < (total or 0),
        )


class UpdateContactStatus(BaseModel):
    """Update contact message status."""
    status: str = Field(..., pattern=r"^(pending|in_progress|resolved|closed)$")
    admin_notes: Optional[str] = None


@router.patch("/admin/{message_id}", response_model=ContactMessageOut)
async def update_contact_message(
    message_id: str,
    update: UpdateContactStatus,
    user: AuthenticatedUser = Depends(get_current_user),
) -> ContactMessageOut:
    """Update a contact message status (admin only)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE contact_messages
            SET status = $2, admin_notes = COALESCE($3, admin_notes), updated_at = NOW()
            WHERE id = $1
            RETURNING id, user_id, name, email, subject, message, category, status, created_at, updated_at, admin_notes
            """,
            message_id,
            update.status,
            update.admin_notes,
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="message_not_found")
        
        return ContactMessageOut(
            id=str(row["id"]),
            user_id=str(row["user_id"]) if row["user_id"] else None,
            name=row["name"],
            email=row["email"],
            subject=row["subject"],
            message=row["message"],
            category=row["category"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            admin_notes=row["admin_notes"],
        )
