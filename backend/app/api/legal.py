"""Legal compliance API endpoints for administrators.

These endpoints are restricted to users with legal_admin permission.
They allow management of legal holds and viewing of legal request logs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.domain.identity import rbac
from app.domain.legal import holds, requests
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/v1/legal", tags=["legal-compliance"])

# Permission required for legal admin operations
LEGAL_ADMIN_PERMISSION = "legal.admin"


async def _require_legal_admin(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Dependency that requires legal admin permission."""
    acl = await rbac.get_acl(user.id)
    if not acl.allows(LEGAL_ADMIN_PERMISSION, campus_id=None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="legal_admin_required",
        )
    return user


# --- Hold Management Schemas ---


class CreateHoldRequest(BaseModel):
    """Request to create a legal hold."""

    request_id: str = Field(..., description="External reference number")
    user_ids: list[UUID] = Field(..., min_length=1, description="User IDs to hold")
    authority: str = Field(..., description="Requesting authority")
    reason: Optional[str] = None
    expires_in_days: int = Field(default=90, ge=1, le=365)
    notes: Optional[str] = None


class HoldResponse(BaseModel):
    """Response containing a legal hold."""

    id: UUID
    request_id: str
    user_ids: list[UUID]
    authority: str
    reason: Optional[str]
    created_by: str
    created_at: datetime
    expires_at: datetime
    released_at: Optional[datetime]
    released_by: Optional[str]
    notes: Optional[str]

    class Config:
        from_attributes = True


class ExtendHoldRequest(BaseModel):
    """Request to extend a hold."""

    additional_days: int = Field(..., ge=1, le=365)


# --- Request Log Schemas ---


class LogRequestInput(BaseModel):
    """Input for logging a legal request."""

    request_type: requests.LegalRequestType
    authority: str
    reference_number: Optional[str] = None
    received_at: Optional[datetime] = None
    user_ids: list[UUID] = Field(default_factory=list)
    data_types: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class CompleteRequestInput(BaseModel):
    """Input for completing a request."""

    data_produced: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class RequestResponse(BaseModel):
    """Response containing a legal request."""

    id: UUID
    request_type: requests.LegalRequestType
    authority: str
    reference_number: Optional[str]
    received_at: datetime
    responded_at: Optional[datetime]
    user_ids: list[UUID]
    data_types: list[str]
    data_produced: Optional[dict[str, Any]]
    notes: Optional[str]
    handled_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserHoldStatus(BaseModel):
    """Check if a user is under legal hold."""

    user_id: UUID
    is_under_hold: bool
    active_holds: int


class ComplianceReport(BaseModel):
    """Compliance summary report."""

    period: dict[str, str]
    total_requests: int
    responded_requests: int
    avg_response_time_hours: Optional[float]
    requests_by_type: dict[str, int]
    unique_users_affected: int


# --- Hold Endpoints ---


@router.post("/holds", response_model=HoldResponse, status_code=status.HTTP_201_CREATED)
async def create_hold(
    request: CreateHoldRequest,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> HoldResponse:
    """Create a new legal preservation hold."""
    service = holds.get_hold_service()
    hold = await service.create_hold(
        holds.CreateHoldRequest(
            request_id=request.request_id,
            user_ids=request.user_ids,
            authority=request.authority,
            reason=request.reason,
            expires_in_days=request.expires_in_days,
            notes=request.notes,
        ),
        created_by=user.id,
    )
    return HoldResponse(**hold.model_dump())


@router.get("/holds", response_model=list[HoldResponse])
async def list_holds(
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> list[HoldResponse]:
    """List all active legal holds."""
    service = holds.get_hold_service()
    active_holds = await service.list_active_holds()
    return [HoldResponse(**h.model_dump()) for h in active_holds]


@router.get("/holds/{hold_id}", response_model=HoldResponse)
async def get_hold(
    hold_id: UUID,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> HoldResponse:
    """Get a specific legal hold."""
    service = holds.get_hold_service()
    hold = await service.get_hold(hold_id)
    if not hold:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="hold_not_found")
    return HoldResponse(**hold.model_dump())


@router.post("/holds/{hold_id}/release", response_model=HoldResponse)
async def release_hold(
    hold_id: UUID,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> HoldResponse:
    """Release a legal hold early."""
    service = holds.get_hold_service()
    hold = await service.release_hold(hold_id, released_by=user.id)
    if not hold:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="hold_not_found")
    return HoldResponse(**hold.model_dump())


@router.post("/holds/{hold_id}/extend", response_model=HoldResponse)
async def extend_hold(
    hold_id: UUID,
    request: ExtendHoldRequest,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> HoldResponse:
    """Extend a legal hold's expiration."""
    service = holds.get_hold_service()
    hold = await service.extend_hold(hold_id, request.additional_days, extended_by=user.id)
    if not hold:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="hold_not_found")
    return HoldResponse(**hold.model_dump())


@router.get("/holds/user/{user_id}", response_model=UserHoldStatus)
async def check_user_hold_status(
    user_id: UUID,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> UserHoldStatus:
    """Check if a user is under any legal hold."""
    is_held = await holds.is_user_under_hold(user_id)
    service = holds.get_hold_service()
    user_holds = await service.list_holds_for_user(user_id)
    # Count only active holds
    from datetime import timezone
    now = datetime.now(timezone.utc)
    active_count = sum(
        1 for h in user_holds
        if h.released_at is None and h.expires_at > now
    )
    return UserHoldStatus(
        user_id=user_id,
        is_under_hold=is_held,
        active_holds=active_count,
    )


# --- Request Log Endpoints ---


@router.post("/requests", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
async def log_request(
    input: LogRequestInput,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> RequestResponse:
    """Log a new legal data request."""
    service = requests.get_request_log_service()
    req = await service.log_request(
        requests.LogRequestInput(
            request_type=input.request_type,
            authority=input.authority,
            reference_number=input.reference_number,
            received_at=input.received_at,
            user_ids=input.user_ids,
            data_types=input.data_types,
            notes=input.notes,
        ),
        handled_by=user.id,
    )
    return RequestResponse(**req.model_dump())


@router.get("/requests", response_model=list[RequestResponse])
async def list_requests(
    request_type: Optional[requests.LegalRequestType] = Query(default=None),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> list[RequestResponse]:
    """List legal requests with optional filters."""
    service = requests.get_request_log_service()
    reqs = await service.list_requests(
        request_type=request_type,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return [RequestResponse(**r.model_dump()) for r in reqs]


@router.get("/requests/{request_id}", response_model=RequestResponse)
async def get_request(
    request_id: UUID,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> RequestResponse:
    """Get a specific legal request."""
    service = requests.get_request_log_service()
    req = await service.get_request(request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="request_not_found")
    return RequestResponse(**req.model_dump())


@router.post("/requests/{request_id}/complete", response_model=RequestResponse)
async def complete_request(
    request_id: UUID,
    input: CompleteRequestInput,
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> RequestResponse:
    """Mark a legal request as completed."""
    service = requests.get_request_log_service()
    req = await service.complete_request(
        request_id,
        requests.CompleteRequestInput(
            data_produced=input.data_produced,
            notes=input.notes,
        ),
    )
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="request_not_found")
    return RequestResponse(**req.model_dump())


# --- Compliance Reporting ---


@router.get("/compliance/report", response_model=ComplianceReport)
async def get_compliance_report(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    user: AuthenticatedUser = Depends(_require_legal_admin),
) -> ComplianceReport:
    """Generate a compliance summary report for a date range."""
    service = requests.get_request_log_service()
    report = await service.generate_compliance_report(start_date, end_date)
    return ComplianceReport(**report)
