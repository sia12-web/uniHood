"""Service for Clubs."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException
from app.domain.clubs.models import Club, ClubMember
from app.domain.clubs.schemas import ClubCreateRequest
from app.domain.xp.service import XPService
from app.infra.postgres import get_pool
from app.infra.redis import redis_client

class ClubService:
    async def create_club(self, user_id: UUID, data: ClubCreateRequest) -> Club:
        """Create a new club if user is Level 6+."""
        # 1. Check Level
        xp_service = XPService()
        stats = await xp_service.get_user_stats(user_id)
        
        if stats.current_level < 6:
            raise HTTPException(status_code=403, detail="Level 6 (Campus Icon) required to create clubs.")

        pool = await get_pool()
        async with pool.acquire() as conn:
            # 2. Insert Club
            row = await conn.fetchrow("""
                INSERT INTO clubs (name, description, owner_id, campus_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, description, owner_id, campus_id, created_at, updated_at
            """, data.name, data.description, user_id, data.campus_id)
            
            club_id = row['id']
            
            # 3. Add Owner as Member
            await conn.execute("""
                INSERT INTO club_members (club_id, user_id, role)
                VALUES ($1, $2, 'owner')
            """, club_id, user_id)
            
            return Club(
                id=club_id,
                name=row['name'],
                description=row['description'],
                owner_id=row['owner_id'],
                campus_id=row['campus_id'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                member_count=1
            )

    async def join_club(self, user_id: UUID, club_id: UUID) -> ClubMember:
        """Join an existing club."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Check if club exists
            club_exists = await conn.fetchval("SELECT 1 FROM clubs WHERE id = $1", club_id)
            if not club_exists:
                 raise HTTPException(status_code=404, detail="Club not found")

            # Insert member (handle duplicates via ON CONFLICT or check)
            # Assuming schema PK (club_id, user_id) handles unique
            try:
                row = await conn.fetchrow("""
                    INSERT INTO club_members (club_id, user_id, role)
                    VALUES ($1, $2, 'member')
                    RETURNING club_id, user_id, role, joined_at
                """, club_id, user_id)
            except Exception:
                # Likely already a member, fetch existing
                row = await conn.fetchrow("""
                    SELECT club_id, user_id, role, joined_at FROM club_members
                    WHERE club_id = $1 AND user_id = $2
                """, club_id, user_id)
            
            return ClubMember(
                club_id=row['club_id'],
                user_id=row['user_id'],
                role=row['role'],
                joined_at=row['joined_at']
            )

    async def list_clubs(self, campus_id: Optional[UUID] = None) -> List[Club]:
        """List all clubs, optionally filtered by campus."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            query = """
                SELECT c.id, c.name, c.description, c.owner_id, c.campus_id, c.created_at, c.updated_at,
                       COUNT(cm.user_id) as member_count
                FROM clubs c
                LEFT JOIN club_members cm ON c.id = cm.club_id
            """
            args = []
            if campus_id:
                query += " WHERE c.campus_id = $1"
                args.append(campus_id)
            
            query += " GROUP BY c.id ORDER BY c.created_at DESC"
            
            rows = await conn.fetch(query, *args)
            return [
                Club(
                    id=row['id'],
                    name=row['name'],
                    description=row['description'],
                    owner_id=row['owner_id'],
                    campus_id=row['campus_id'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    member_count=row['member_count']
                ) for row in rows
            ]

    async def get_club(self, club_id: UUID) -> Club:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT c.id, c.name, c.description, c.owner_id, c.campus_id, c.created_at, c.updated_at,
                       COUNT(cm.user_id) as member_count
                FROM clubs c
                LEFT JOIN club_members cm ON c.id = cm.club_id
                WHERE c.id = $1
                GROUP BY c.id
            """, club_id)
            
            if not row:
                raise HTTPException(status_code=404, detail="Club not found")
                
            return Club(
                id=row['id'],
                name=row['name'],
                description=row['description'],
                owner_id=row['owner_id'],
                campus_id=row['campus_id'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                member_count=row['member_count']
            )
