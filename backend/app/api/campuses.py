"""API endpoints for campuses."""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.domain.campuses.service import CampusService

router = APIRouter(prefix="/campuses", tags=["campuses"])

class CampusResponse(BaseModel):
    id: UUID
    name: str
    domain: Optional[str] = None
    logo_url: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None

@router.get("/", response_model=List[CampusResponse])
async def list_campuses():
    """List all available campuses."""
    service = CampusService()
    campuses = await service.list_campuses()
    return campuses
