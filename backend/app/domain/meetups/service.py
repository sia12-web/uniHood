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
from app.domain.social import notifications



class MeetupService:
    def __init__(self):
        self._room_service = room_service.RoomService()
        self._notification_service = notifications.NotificationService()

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

    async def _ensure_schema(self, conn: asyncpg.Connection) -> None:
        # Add visibility column if it doesn't exist
        await conn.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'meetups' AND column_name = 'visibility'
                ) THEN
                    ALTER TABLE meetups ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'GLOBAL';
                END IF;
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'meetups' AND column_name = 'capacity'
                ) THEN
                    ALTER TABLE meetups ADD COLUMN capacity INTEGER NOT NULL DEFAULT 10;
                END IF;
            END
            $$;
            """
        )

    async def create_meetup(
        self, auth_user: AuthenticatedUser, payload: schemas.MeetupCreateRequest
    ) -> schemas.MeetupResponse:
        pool = await self._get_pool()
        
        # Create a room for the meetup
        # We use a private room, capacity 50 (arbitrary high number or based on meetup?)
        # Let's use 50 for now.
        room_payload = room_service.schemas.RoomCreateRequest(
            name=f"Meetup: {payload.title}",
            preset="12+", # Largest preset, but we override capacity
            visibility="private",
            campus_id=payload.campus_id or auth_user.campus_id,
            capacity=payload.capacity
        )
        
        # We need to call create_room. It expects RoomCreateRequest.
        # Note: RoomService.create_room might raise if campus mismatch, handled by caller.
        room = await self._room_service.create_room(auth_user, room_payload)
        
        async with pool.acquire() as conn:
            await self._ensure_schema(conn)
            async with conn.transaction():
                # Insert meetup
                row = await conn.fetchrow(
                    """
                    INSERT INTO meetups (
                        creator_user_id, campus_id, title, description, category,
                        start_at, duration_min, status, room_id, visibility, capacity
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
                    UUID(room.id),
                    payload.visibility.value,
                    payload.capacity
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
        
        # Visibility Logic:
        # - GLOBAL: Visible to everyone
        # - PRIVATE: Visible if (creator == me OR me is friend of creator)
        
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
            AND (
                m.visibility = 'GLOBAL' 
                OR m.creator_user_id = $2
                OR EXISTS (
                    SELECT 1 FROM friendships f 
                    WHERE f.user_id = $2 
                    AND f.friend_id = m.creator_user_id 
                    AND f.status = 'accepted'
                )
            )
        """
        params = [UUID(campus_id), UUID(auth_user.id), now]
        
        if category:
            query += " AND m.category = $4"
            params.append(category)
            
        query += " ORDER BY m.start_at ASC"
        
        async with pool.acquire() as conn:
            await self._ensure_schema(conn)
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
            await self._ensure_schema(conn)
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
                
            # Check visibility access for detail as well
            if row["visibility"] == schemas.MeetupVisibility.PRIVATE.value:
                is_creator = str(row["creator_user_id"]) == str(auth_user.id)
                if not is_creator:
                    is_friend = await conn.fetchval(
                        "SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'",
                        UUID(auth_user.id), row["creator_user_id"]
                    )
                    if not is_friend:
                         raise HTTPException(status_code=403, detail="This is a private meetup.")

            participants_rows = await conn.fetch(
                """
                SELECT mp.*, COALESCE(NULLIF(u.display_name, ''), u.handle) as display_name, u.avatar_url
                FROM meetup_participants mp
                JOIN users u ON u.id = mp.user_id
                WHERE mp.meetup_id = $1
                ORDER BY mp.joined_at ASC
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
                left_at=p["left_at"],
                display_name=p["display_name"],
                avatar_url=p["avatar_url"]
            ) for p in participants_rows
        ]
        
        return detail

    async def join_meetup(self, meetup_id: UUID, auth_user: AuthenticatedUser) -> None:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            await self._ensure_schema(conn)
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
            
            # Check visibility
            if meetup["visibility"] == schemas.MeetupVisibility.PRIVATE.value:
                is_creator = str(meetup["creator_user_id"]) == str(auth_user.id)
                if not is_creator:
                    is_friend = await conn.fetchval(
                        "SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'",
                        UUID(auth_user.id), meetup["creator_user_id"]
                    )
                    if not is_friend:
                         raise HTTPException(status_code=403, detail="Cannot join private meetup unless friends with host.")

            status = self._compute_status(meetup)
            if status in (schemas.MeetupStatus.ENDED, schemas.MeetupStatus.CANCELLED):
                raise HTTPException(status_code=400, detail="Cannot join ended or cancelled meetup")
            
            # Check capacity
            participants_count = await conn.fetchval(
                "SELECT COUNT(*) FROM meetup_participants WHERE meetup_id = $1 AND status = 'JOINED'",
                meetup_id
            )
            if participants_count >= meetup.get("capacity", 10):
                 raise HTTPException(status_code=409, detail="Meetup is full")
                
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

        # Notify host
        creator_id = str(meetup["creator_user_id"])
        if creator_id != str(auth_user.id):
            await self._notification_service.notify_user(
                user_id=creator_id,
                title="New Meetup Participant",
                body=f"Someone joined your meetup: {meetup['title']}",
                kind="meetup_join",
                link=f"/meetups/{meetup_id}"
            )


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
            my_role=my_role,
            current_user_id=current_user_id,
            visibility=row.get("visibility", schemas.MeetupVisibility.GLOBAL.value),
            capacity=row.get("capacity", 10)
        )

