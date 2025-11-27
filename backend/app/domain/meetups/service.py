from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.domain.meetups import schemas
from app.domain.rooms import models as room_models
from app.domain.rooms import service as room_service
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool


class MeetupService:
    def __init__(self):
        self._room_service = room_service.RoomService()

    async def _get_pool(self) -> asyncpg.Pool:
        return await get_pool()

    def _compute_status(self, row: dict) -> str:
        db_status = row["status"]
        if db_status in (schemas.MeetupStatus.CANCELLED, schemas.MeetupStatus.ENDED):
            return db_status

        now = datetime.now(timezone.utc)
        start_at = row["start_at"]
        duration = timedelta(minutes=row["duration_min"])
        end_at = start_at + duration

        if now < start_at:
            return schemas.MeetupStatus.UPCOMING
        if now < end_at:
            return schemas.MeetupStatus.ACTIVE
        return schemas.MeetupStatus.ENDED

    async def create_meetup(
        self, auth_user: AuthenticatedUser, payload: schemas.MeetupCreateRequest
    ) -> schemas.MeetupResponse:
        pool = await self._get_pool()
        
        # Create a room for the meetup
        # We use a private room, capacity 50 (arbitrary high number or based on meetup?)
        # Let's use 50 for now.
        room_payload = room_service.schemas.RoomCreateRequest(
            name=f"Meetup: {payload.title}",
            preset="12+", # Largest preset
            visibility="private",
            campus_id=payload.campus_id or auth_user.campus_id
        )
        
        # We need to call create_room. It expects RoomCreateRequest.
        # Note: RoomService.create_room might raise if campus mismatch, handled by caller.
        room = await self._room_service.create_room(auth_user, room_payload)
        
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Insert meetup
                row = await conn.fetchrow(
                    """
                    INSERT INTO meetups (
                        creator_user_id, campus_id, title, description, category,
                        start_at, duration_min, status, room_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                    """,
                    UUID(auth_user.id),
                    UUID(payload.campus_id or auth_user.campus_id),
                    payload.title,
                    payload.description,
                    payload.category,
                    payload.start_at,
                    payload.duration_min,
                    schemas.MeetupStatus.UPCOMING,
                    UUID(room.id)
                )
                
                # Insert host participant
                await conn.execute(
                    """
                    INSERT INTO meetup_participants (meetup_id, user_id, role, status)
                    VALUES ($1, $2, $3, $4)
                    """,
                    row["id"],
                    UUID(auth_user.id),
                    schemas.MeetupRole.HOST,
                    schemas.MeetupParticipantStatus.JOINED
                )
                
        return self._map_row_to_response(row, auth_user.id, is_joined=True, my_role=schemas.MeetupRole.HOST)

    async def list_meetups(
        self, 
        auth_user: AuthenticatedUser, 
        campus_id: str, 
        category: Optional[schemas.MeetupCategory] = None
    ) -> List[schemas.MeetupResponse]:
        pool = await self._get_pool()
        
        # Filter by campus and status (UPCOMING or ACTIVE)
        # We use time-based filtering for status to be accurate
        now = datetime.now(timezone.utc)
        
        query = """
            SELECT m.*, 
                   (SELECT COUNT(*) FROM meetup_participants mp WHERE mp.meetup_id = m.id AND mp.status = 'JOINED') as participants_count,
                   mp.role as my_role,
                   mp.status as my_status
            FROM meetups m
            LEFT JOIN meetup_participants mp ON m.id = mp.meetup_id AND mp.user_id = $2
            WHERE m.campus_id = $1
            AND m.status != 'CANCELLED'
            AND (m.start_at + (m.duration_min || ' minutes')::interval) > $3
        """
        params = [UUID(campus_id), UUID(auth_user.id), now]
        
        if category:
            query += " AND m.category = $4"
            params.append(category)
            
        query += " ORDER BY m.start_at ASC"
        
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            
        return [
            self._map_row_to_response(
                row, 
                auth_user.id, 
                is_joined=(row["my_status"] == schemas.MeetupParticipantStatus.JOINED),
                my_role=row["my_role"]
            ) 
            for row in rows
        ]

    async def get_meetup(self, meetup_id: UUID, auth_user: AuthenticatedUser) -> schemas.MeetupDetailResponse:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT m.*, 
                       (SELECT COUNT(*) FROM meetup_participants mp WHERE mp.meetup_id = m.id AND mp.status = 'JOINED') as participants_count,
                       mp.role as my_role,
                       mp.status as my_status
                FROM meetups m
                LEFT JOIN meetup_participants mp ON m.id = mp.meetup_id AND mp.user_id = $2
                WHERE m.id = $1
                """,
                meetup_id,
                UUID(auth_user.id)
            )
            
            if not row:
                raise HTTPException(status_code=404, detail="Meetup not found")
                
            participants_rows = await conn.fetch(
                """
                SELECT * FROM meetup_participants 
                WHERE meetup_id = $1 AND status = 'JOINED'
                ORDER BY joined_at ASC
                """,
                meetup_id
            )
            
        response = self._map_row_to_response(
            row, 
            auth_user.id, 
            is_joined=(row["my_status"] == schemas.MeetupParticipantStatus.JOINED),
            my_role=row["my_role"]
        )
        
        detail = schemas.MeetupDetailResponse(**response.dict())
        detail.participants = [
            schemas.MeetupParticipant(
                user_id=p["user_id"],
                role=p["role"],
                status=p["status"],
                joined_at=p["joined_at"],
                left_at=p["left_at"]
            ) for p in participants_rows
        ]
        
        return detail

    async def join_meetup(self, meetup_id: UUID, auth_user: AuthenticatedUser) -> None:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
            
            status = self._compute_status(meetup)
            if status in (schemas.MeetupStatus.ENDED, schemas.MeetupStatus.CANCELLED):
                raise HTTPException(status_code=400, detail="Cannot join ended or cancelled meetup")
                
            # Check if already joined
            existing = await conn.fetchrow(
                "SELECT * FROM meetup_participants WHERE meetup_id = $1 AND user_id = $2",
                meetup_id, UUID(auth_user.id)
            )
            
            if existing and existing["status"] == schemas.MeetupParticipantStatus.JOINED:
                return # Already joined
                
            async with conn.transaction():
                if existing:
                    await conn.execute(
                        """
                        UPDATE meetup_participants 
                        SET status = 'JOINED', joined_at = NOW(), left_at = NULL
                        WHERE meetup_id = $1 AND user_id = $2
                        """,
                        meetup_id, UUID(auth_user.id)
                    )
                else:
                    await conn.execute(
                        """
                        INSERT INTO meetup_participants (meetup_id, user_id, role, status)
                        VALUES ($1, $2, $3, $4)
                        """,
                        meetup_id, UUID(auth_user.id), schemas.MeetupRole.PARTICIPANT, schemas.MeetupParticipantStatus.JOINED
                    )
        
        # Add to room
        if meetup["room_id"]:
            room_id = str(meetup["room_id"])
            # We need to fetch the room object to pass to add_member
            room = await self._room_service.get_room(room_id)
            if room:
                member = room_models.RoomMember(
                    room_id=room_id,
                    user_id=str(auth_user.id),
                    role="member",
                    muted=False,
                    joined_at=datetime.now(timezone.utc)
                )
                await self._room_service.add_member(room, member)

    async def leave_meetup(self, meetup_id: UUID, auth_user: AuthenticatedUser) -> None:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
                
            async with conn.transaction():
                await conn.execute(
                    """
                    UPDATE meetup_participants 
                    SET status = 'LEFT', left_at = NOW()
                    WHERE meetup_id = $1 AND user_id = $2 AND status = 'JOINED'
                    """,
                    meetup_id, UUID(auth_user.id)
                )
                
        # Remove from room
        if meetup["room_id"]:
            room_id = str(meetup["room_id"])
            room = await self._room_service.get_room(room_id)
            if room:
                await self._room_service.remove_member(room, str(auth_user.id))

    async def cancel_meetup(self, meetup_id: UUID, reason: str, auth_user: AuthenticatedUser) -> None:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
                
            if str(meetup["creator_user_id"]) != str(auth_user.id):
                raise HTTPException(status_code=403, detail="Only host can cancel meetup")
                
            await conn.execute(
                """
                UPDATE meetups 
                SET status = 'CANCELLED', cancel_reason = $2, updated_at = NOW()
                WHERE id = $1
                """,
                meetup_id, reason
            )

    def _map_row_to_response(
        self, row: dict, current_user_id: UUID, is_joined: bool, my_role: Optional[str]
    ) -> schemas.MeetupResponse:
        return schemas.MeetupResponse(
            id=row["id"],
            creator_user_id=row["creator_user_id"],
            campus_id=row["campus_id"],
            title=row["title"],
            description=row["description"],
            category=row["category"],
            start_at=row["start_at"],
            duration_min=row["duration_min"],
            status=self._compute_status(row),
            room_id=row["room_id"],
            cancel_reason=row["cancel_reason"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            participants_count=row.get("participants_count", 0),
            is_joined=is_joined,
            my_role=my_role
        )
