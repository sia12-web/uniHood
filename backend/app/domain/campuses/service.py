"""Service for managing campuses."""

from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

from app.infra.postgres import get_pool

class Campus(BaseModel):
    id: UUID
    name: str
    domain: Optional[str]
    logo_url: Optional[str]
    lat: Optional[float]
    lon: Optional[float]

class CampusService:
    """Service for campus operations."""

    async def list_campuses(self) -> List[dict]:
        """List all available campuses."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, name, domain, logo_url, lat, lon 
                FROM campuses 
                ORDER BY name ASC
            """)
            return [dict(row) for row in rows]

    async def get_campus(self, campus_id: UUID) -> Optional[dict]:
        """Get a specific campus."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, name, domain, logo_url, lat, lon
                FROM campuses
                WHERE id = $1
            """, campus_id)
            return dict(row) if row else None
