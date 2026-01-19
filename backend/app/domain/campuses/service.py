"""Service for managing campuses."""

from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

from app.infra import postgres

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
        pool = await postgres.get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, name, domain, logo_url, lat, lon 
                FROM campuses 
                ORDER BY name ASC
            """)
            return [dict(row) for row in rows]

    async def get_campus(self, campus_id: UUID) -> Optional[dict]:
        """Get a specific campus."""
        pool = await postgres.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, name, domain, logo_url, lat, lon
                FROM campuses
                WHERE id = $1
            """, campus_id)
            return dict(row) if row else None

    async def find_by_domain(self, domain_suffix: str) -> Optional[dict]:
        """Find a campus by matching domain suffix (e.g. 'concordia.ca' or 'mail.concordia.ca')."""
        pool = await postgres.get_pool()
        async with pool.acquire() as conn:
            # We want to find a campus where the user's email domain ENDS with the campus domain.
            # e.g. user has 'student.mcgill.ca', campus has 'mcgill.ca' -> match.
            #     user has 'concordia.ca', campus has 'concordia.ca' -> match.
            # Note: We prioritize the longest matching domain if we had multiple (not handled here),
            # but for now we just look for ANY match.
            rows = await conn.fetch("""
                SELECT id, name, domain, logo_url, lat, lon
                FROM campuses
                WHERE domain IS NOT NULL AND length(domain) > 0
            """)
            
            # Application-side matching is safer for "ends with" logic than regex in SQL for now
            target_domain = domain_suffix.lower().strip()
            
            for row in rows:
                campus_domain = (row["domain"] or "").lower().strip()
                if not campus_domain:
                    continue
                    
                # Exact match
                if target_domain == campus_domain:
                    return dict(row)
                    
                # Suffix match (ensure it's a dot boundary, e.g. .concordia.ca)
                if target_domain.endswith("." + campus_domain):
                    return dict(row)
                    
            return None

    async def seed_campuses(self):
        """Seed default campuses (Concordia)."""
        pool = await postgres.get_pool()
        # Concordia UUID from logs: 489e5435-2ebd-41c7-a4b7-ee521e9a9bb0
        from uuid import UUID
        concordia_id = UUID("489e5435-2ebd-41c7-a4b7-ee521e9a9bb0")
        # Use a reliable PNG for the logo
        concordia_logo = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Concordia_University_logo.svg/512px-Concordia_University_logo.svg.png"
        
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO campuses (id, name, domain, logo_url, lat, lon)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    logo_url = EXCLUDED.logo_url,
                    lat = EXCLUDED.lat,
                    lon = EXCLUDED.lon
            """, concordia_id, "Concordia University", "concordia.ca", concordia_logo, 45.4972, -73.5790)
