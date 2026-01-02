from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from app.domain.meetups import schemas, policy
from app.domain.rooms import models as room_models
from app.domain.rooms import service as room_service
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.domain.social import notifications
from app.domain.leaderboards.service import LeaderboardService



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
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'meetups' AND column_name = 'location'
                ) THEN
                    ALTER TABLE meetups ADD COLUMN location TEXT;
                END IF;
            END
            $$;
            """
        )

    async def create_meetup(
        self, auth_user: AuthenticatedUser, payload: schemas.MeetupCreateRequest
    ) -> schemas.MeetupResponse:
        # Enforce level-based limits
        await policy.enforce_create_limits(auth_user.id, payload.capacity)
        
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
                        start_at, duration_min, status, room_id, visibility, capacity, location
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
                    payload.capacity,
                    payload.location
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
        
        # Track meetup creation for leaderboard and XP (non-blocking, anti-cheat validated)
        try:
            lb_service = LeaderboardService()
            await lb_service.record_room_created(user_id=auth_user.id, room_id=str(room.id))


            # Award XP moved to update_attendance to prevent ghost meetup spam
            # We only record the leaderboard stats here
        except Exception:
            pass  # Non-critical, don't block meetup creation

        # Analytics tracking
        from app.domain.identity import audit
        await audit.append_db_event(
            user_id=auth_user.id,
            event="meetup.create",
            meta={
                "meetup_id": str(row["id"]),
                "category": payload.category.value if hasattr(payload.category, 'value') else str(payload.category),
                "title": payload.title
            }
        )

        # Notifications
        import asyncio
        asyncio.create_task(self._notify_meetup_creation(
            meetup_id=row["id"],
            title=payload.title,
            visibility=payload.visibility.value,
            creator=auth_user,
            campus_id=str(payload.campus_id or auth_user.campus_id)
        ))
                
        return self._map_row_to_response(row, auth_user.id, is_joined=True, my_role=schemas.MeetupRole.HOST)

    async def _notify_meetup_creation(
        self, 
        meetup_id: UUID, 
        title: str, 
        visibility: str, 
        creator: AuthenticatedUser, 
        campus_id: str
    ) -> None:
        """Send notifications and emails for new meetup."""
        # Use local import to avoid circular dependency if any
        from app.domain.identity import mailer as identity_mailer
        from app.settings import settings

        pool = await self._get_pool()
        meetup_link = f"{settings.public_app_url}/meetups/{meetup_id}"
        display_link = f"/meetups/{meetup_id}"
        creator_name = creator.display_name or "A user"
        
        async with pool.acquire() as conn:
            if visibility == "FRIENDS":
                # Fetch friends
                rows = await conn.fetch(
                    """
                    SELECT u.id, u.email 
                    FROM friendships f
                    JOIN users u ON f.friend_id = u.id
                    WHERE f.user_id = $1 AND f.status = 'accepted' AND u.deleted_at IS NULL
                    """,
                    UUID(creator.id)
                )
                for r in rows:
                    uid = str(r["id"])
                    email = r["email"]
                    
                    # 1. In-App Notification
                    await self._notification_service.notify_user(
                        user_id=uid,
                        title="Private Meetup Invite",
                        body=f"{creator_name} invited you to: {title}",
                        kind="meetup_invite",
                        link=display_link
                    )
                    
                    # 2. Email Notification
                    if email:
                        try:
                            await identity_mailer.send_meetup_invitation(
                                to_email=email,
                                meetup_title=title,
                                host_name=creator_name,
                                link=meetup_link,
                                recipient_user_id=uid
                            )
                        except Exception:
                            pass # Don't crash on email fail

            elif visibility in ("CAMPUS", "CITY"):
                # Fetch ALL campus users (excluding creator)
                # Note: This simply broadcasts to everyone in the campus.
                rows = await conn.fetch(
                    """
                    SELECT id FROM users
                    WHERE campus_id = $1 AND id != $2 AND deleted_at IS NULL
                    """,
                    UUID(campus_id), UUID(creator.id)
                )
                
                # Global = No Email, just Notification
                # We do this in a loop. For large campuses, this should be a batch job.
                for r in rows:
                    uid = str(r["id"])
                    await self._notification_service.notify_user(
                        user_id=uid,
                        title="New Campus Meetup",
                        body=f"{creator_name} posted: {title}",
                        kind="meetup_announce",
                        link=display_link
                    )

    async def get_upcoming_count(self, auth_user: AuthenticatedUser, campus_id: str) -> int:
        pool = await self._get_pool()
        now = datetime.now(timezone.utc)
        async with pool.acquire() as conn:
            val = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM meetups m
                WHERE m.campus_id = $1 
                  AND m.status != 'CANCELLED'
                  AND (m.start_at + (m.duration_min * INTERVAL '1 minute')) > $3
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
                """,
                UUID(campus_id), UUID(auth_user.id), now
            )
            return val or 0


    async def list_meetups(
        self, 
        auth_user: AuthenticatedUser, 
        campus_id: str, 
        category: Optional[schemas.MeetupCategory] = None,
        participant_id: Optional[str] = None
    ) -> List[schemas.MeetupResponse]:
        pool = await self._get_pool()
        
        # Filter by campus and status (UPCOMING or ACTIVE)
        # We use time-based filtering for status to be accurate
        now = datetime.now(timezone.utc)
        
        params = [UUID(campus_id), UUID(auth_user.id)]
        
        # Base Query Construction
        query = """
            SELECT m.*, 
                   (SELECT COUNT(*) FROM meetup_participants mp WHERE mp.meetup_id = m.id AND mp.status = 'JOINED') as participants_count,
                   mp.role as my_role,
                   mp.status as my_status,
                   COALESCE(NULLIF(u.display_name, ''), u.handle) as creator_name,
                   u.avatar_url as creator_avatar_url,
                   ARRAY(
                        SELECT u2.avatar_url 
                        FROM meetup_participants mp2 
                        JOIN users u2 ON mp2.user_id = u2.id 
                        WHERE mp2.meetup_id = m.id 
                        AND mp2.status = 'JOINED'
                        AND u2.avatar_url IS NOT NULL 
                        LIMIT 3
                   ) as recent_participants_avatars
            FROM meetups m
            LEFT JOIN users u ON m.creator_user_id = u.id
            LEFT JOIN meetup_participants mp ON m.id = mp.meetup_id AND mp.user_id = $2
        """
        
        where_conditions = ["m.campus_id = $1", "m.status != 'CANCELLED'"]
        
        if participant_id:
            # Sort by recent descending, show past meetups too
            query += " JOIN meetup_participants mp_filter ON m.id = mp_filter.meetup_id "
            params.append(UUID(participant_id))
            p_idx = len(params)
            where_conditions.append(f"mp_filter.user_id = ${p_idx}")
            where_conditions.append("mp_filter.status = 'JOINED'")
        else:
            # Default feed: Upcoming only
            params.append(now)
            n_idx = len(params)
            where_conditions.append(f"(m.start_at + (m.duration_min * INTERVAL '1 minute')) > ${n_idx}")
        
        # Visibility Logic
        where_conditions.append("""
            (
                m.visibility IN ('CAMPUS', 'CITY') 
                OR m.creator_user_id = $2
                OR (
                    m.visibility = 'FRIENDS'
                    AND EXISTS (
                        SELECT 1 FROM friendships f 
                        WHERE f.user_id = $2 
                        AND f.friend_id = m.creator_user_id 
                        AND f.status = 'accepted'
                    )
                )
            )
        """)
        
        if category:
            params.append(category)
            c_idx = len(params)
            where_conditions.append(f"m.category = ${c_idx}")
            
        full_query = query + " WHERE " + " AND ".join(where_conditions)
        
        if participant_id:
            full_query += " ORDER BY m.start_at DESC LIMIT 10"
        else:
            full_query += " ORDER BY m.start_at ASC"
        
        async with pool.acquire() as conn:
            await self._ensure_schema(conn)
            rows = await conn.fetch(full_query, *params)
            
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
            if row["visibility"] == schemas.MeetupVisibility.FRIENDS.value:
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
        # Enforce level-based limits
        await policy.enforce_join_limits(auth_user.id)
        
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            await self._ensure_schema(conn)
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
            
            # Check visibility
            if meetup["visibility"] == schemas.MeetupVisibility.FRIENDS.value:
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
            # Use the repository directly to get room and add member
            room = await self._room_service._repo.get_room(room_id)
            if room:
                member = room_models.RoomMember(
                    room_id=room_id,
                    user_id=str(auth_user.id),
                    role="member",
                    muted=False,
                    joined_at=datetime.now(timezone.utc)
                )
                await self._room_service._repo.add_member(room, member)
                
                # Emit real-time event for instant participant update
                from app.domain.rooms import sockets as room_sockets
                await room_sockets.emit_member_event(
                    "room:member_joined",
                    room_id,
                    {
                        "room_id": room_id,
                        "user_id": str(auth_user.id),
                        "role": "member",
                        "meetup_id": str(meetup_id),
                    }
                )
            
            # Track meetup join for leaderboard (non-blocking, anti-cheat validated)
            try:
                lb_service = LeaderboardService()
                await lb_service.record_room_joined(user_id=auth_user.id, room_id=room_id)
            except Exception:
                pass  # Non-critical, don't block meetup join

            # Analytics tracking
            from app.domain.identity import audit
            await audit.append_db_event(
                user_id=str(auth_user.id),
                event="meetup.join",
                meta={
                    "meetup_id": str(meetup_id),
                    "room_id": room_id
                }
            )

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
        attendee_count = 0
        room_id = None
        
        async with pool.acquire() as conn:
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
            
            room_id = str(meetup["room_id"]) if meetup["room_id"] else None
            
            # Get current attendee count before leaving
            attendee_count = await conn.fetchval(
                "SELECT COUNT(*) FROM meetup_participants WHERE meetup_id = $1 AND status = 'JOINED'",
                meetup_id
            )
                
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
        if room_id:
            room = await self._room_service._repo.get_room(room_id)
            if room:
                await self._room_service._repo.remove_member(room, str(auth_user.id))
                
                # Emit real-time event for instant participant update
                from app.domain.rooms import sockets as room_sockets
                await room_sockets.emit_member_event(
                    "room:member_left",
                    room_id,
                    {
                        "room_id": room_id,
                        "user_id": str(auth_user.id),
                    }
                )
            
            # Track meetup leave for leaderboard (awards points if stayed long enough)
            try:
                lb_service = LeaderboardService()
                await lb_service.record_room_left(
                    user_id=auth_user.id,
                    room_id=room_id,
                    attendee_count=attendee_count,
                )
            except Exception:
                pass  # Non-critical, don't block meetup leave

    async def cancel_meetup(self, meetup_id: UUID, reason: str, auth_user: AuthenticatedUser) -> None:
        pool = await self._get_pool()
        room_id = None
        
        async with pool.acquire() as conn:
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
                
            if str(meetup["creator_user_id"]) != str(auth_user.id):
                raise HTTPException(status_code=403, detail="Only host can cancel meetup")
            
            room_id = str(meetup["room_id"]) if meetup["room_id"] else None
                
            await conn.execute(
                """
                UPDATE meetups 
                SET status = 'CANCELLED', cancel_reason = $2, updated_at = NOW()
                WHERE id = $1
                """,
                meetup_id, reason
            )
        
        # Track meetup cancellation for leaderboard (may remove points if cancelled too quickly)
        if room_id:
            try:
                lb_service = LeaderboardService()
                await lb_service.record_room_cancelled(
                    user_id=auth_user.id,
                    room_id=room_id,
                )
            except Exception:
                pass  # Non-critical, don't block cancellation

    def _map_row_to_response(
        self, row: dict, current_user_id: UUID, is_joined: bool, my_role: Optional[str]
    ) -> schemas.MeetupResponse:
        return schemas.MeetupResponse(
            id=row["id"],
            creator_user_id=row["creator_user_id"],
            campus_id=row["campus_id"],
            title=row["title"],
            description=row["description"],
            location=row.get("location"),
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
            visibility=row.get("visibility", schemas.MeetupVisibility.CAMPUS.value),
            capacity=row.get("capacity", 10),
            creator_name=row.get("creator_name"),
            creator_avatar_url=row.get("creator_avatar_url"),
            recent_participants_avatars=row.get("recent_participants_avatars", [])
        )

    async def get_usage(self, auth_user: AuthenticatedUser) -> schemas.MeetupUsageResponse:
        from app.domain.xp.service import XPService
        xp_stats = await XPService().get_user_stats(auth_user.id)
        level = xp_stats.current_level
        
        hosting_limit = policy.LEVEL_MAX_SIMULTANEOUS_HOSTING.get(level, 1)
        joining_limit = policy.LEVEL_MAX_JOINED_MEETUPS.get(level, 5)
        max_capacity = policy.LEVEL_MEETUP_CAPACITY.get(level, 5)
        
        daily_create_limit = policy.LEVEL_DAILY_CREATE_LIMIT.get(level, 3)
        daily_join_limit = policy.LEVEL_DAILY_JOIN_LIMIT.get(level, 10)
        
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            hosting_usage = await conn.fetchval(
                "SELECT COUNT(*) FROM meetups WHERE creator_user_id = $1 AND status IN ('UPCOMING', 'ACTIVE') AND (start_at + (duration_min * INTERVAL '1 minute')) > NOW()",
                UUID(auth_user.id)
            )
            joining_usage = await conn.fetchval(
                """
                SELECT COUNT(*) FROM meetup_participants mp
                JOIN meetups m ON mp.meetup_id = m.id
                WHERE mp.user_id = $1 AND mp.status = 'JOINED' 
                AND m.status IN ('UPCOMING', 'ACTIVE')
                AND (m.start_at + (m.duration_min * INTERVAL '1 minute')) > NOW()
                """,
                UUID(auth_user.id)
            )
            daily_create_usage = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM meetups
                WHERE creator_user_id = $1
                AND created_at > NOW() - INTERVAL '24 hours'
                """,
                UUID(auth_user.id)
            )
            daily_join_usage = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM meetup_participants
                WHERE user_id = $1
                AND joined_at > NOW() - INTERVAL '24 hours'
                """,
                UUID(auth_user.id)
            )
            
        return schemas.MeetupUsageResponse(
            hosting_limit=hosting_limit,
            hosting_usage=hosting_usage or 0,
            joining_limit=joining_limit,
            joining_usage=joining_usage or 0,
            max_capacity=max_capacity,
            daily_create_limit=daily_create_limit,
            daily_create_usage=daily_create_usage or 0,
            daily_join_limit=daily_join_limit,
            daily_join_usage=daily_join_usage or 0
        )


    async def update_attendance(
        self, 
        meetup_id: UUID, 
        auth_user: AuthenticatedUser, 
        payload: schemas.MeetupAttendanceUpdateRequest
    ) -> None:
        pool = await self._get_pool()
        
        async with pool.acquire() as conn:
            # 1. Verify Meetup & Host
            meetup = await conn.fetchrow("SELECT * FROM meetups WHERE id = $1", meetup_id)
            if not meetup:
                raise HTTPException(status_code=404, detail="Meetup not found")
            
            if str(meetup["creator_user_id"]) != str(auth_user.id):
                raise HTTPException(status_code=403, detail="Only the host can update attendance.")
                
            # 2. Update status for specified users
            # We only track 'PRESENT' for XP awards. 
            # If ABSENT, we effectively just ensure they don't get XP.
            # But currently we don't have a specific column for 'verified attendance'.
            # We can use a new 'role' or a JSONB column or a separate table.
            # For simplicity in this iteration, let's assume we award XP immediately here if PRESENT.
            
            if payload.status == schemas.AttendanceStatus.PRESENT:
                from app.domain.xp import XPService
                from app.domain.xp.models import XPAction
                
                # Filter out the host from the participants list to prevent double-dipping
                # (Host gets MEETUP_HOST XP, not MEETUP_JOIN XP)
                target_ids = [uid for uid in payload.user_ids if str(uid) != str(auth_user.id)]
                
                for participant_id in target_ids:
                    # Check if they really joined
                    is_joined = await conn.fetchval(
                        "SELECT 1 FROM meetup_participants WHERE meetup_id = $1 AND user_id = $2 AND status = 'JOINED'",
                        meetup_id, participant_id
                    )
                    
                    if is_joined:
                        # Award XP (Idempotency handled by XPService typically, or we rely on unique key)
                        # To be safe, XPService should deduplicate based on metadata.
                        await XPService().award_xp(
                            str(participant_id), 
                            XPAction.MEETUP_JOIN, 
                            metadata={
                                "meetup_id": str(meetup_id), 
                                "host_id": str(auth_user.id),
                                "verified": True
                            }
                        )
                
                # Award Host XP if not already awarded (Ghost Meetup Prevention)
                # We do this only if at least one person was PRESENT
                if payload.user_ids:
                    host_xp_awarded = await conn.fetchval(
                        "SELECT 1 FROM xp_events WHERE user_id = $1 AND action_type = 'meetup_host' AND metadata->>'meetup_id' = $2",
                        UUID(auth_user.id), str(meetup_id)
                    )
                    
                    if not host_xp_awarded:
                        await XPService().award_xp(
                            str(auth_user.id),
                            XPAction.MEETUP_HOST,
                            metadata={"meetup_id": str(meetup_id)}
                        )

                # Optional: Mark in DB that they attended (for future analytics)
                # This would require schema change, let's skip for now unless requested.
