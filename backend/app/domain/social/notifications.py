"""Domain logic for user notifications."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

import asyncpg

from app.infra.postgres import get_pool
from app.domain.social import sockets


@dataclass
class Notification:
    id: str
    user_id: str
    title: str
    body: str
    kind: str  # e.g. "meetup_join", "friend_request"
    link: Optional[str]
    read_at: Optional[datetime]
    created_at: datetime

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "body": self.body,
            "kind": self.kind,
            "link": self.link,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat(),
        }


class NotificationRepository:
    async def create(
        self,
        *,
        user_id: str,
        title: str,
        body: str,
        kind: str,
        link: Optional[str] = None,
    ) -> Notification:
        pool = await get_pool()
        now = datetime.now(timezone.utc)
        nid = str(uuid.uuid4())
        async with pool.acquire() as conn:
            # Ensure table exists (simple migration for this task)
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    link TEXT,
                    read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
                """
            )
            
            row = await conn.fetchrow(
                """
                INSERT INTO notifications (id, user_id, title, body, kind, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                nid,
                user_id,
                title,
                body,
                kind,
                link,
                now,
            )
            return self._map_row(row)

    async def list_for_user(self, user_id: str, limit: int = 50) -> List[Notification]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Ensure table exists to avoid errors on first run if not created yet
            # (In a real app, this should be a migration script)
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    link TEXT,
                    read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL
                );
                """
            )
            
            rows = await conn.fetch(
                """
                SELECT * FROM notifications
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                user_id,
                limit,
            )
            return [self._map_row(row) for row in rows]

    async def mark_read(self, user_id: str, notification_id: str) -> None:
        pool = await get_pool()
        now = datetime.now(timezone.utc)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE notifications
                SET read_at = $3
                WHERE id = $1 AND user_id = $2
                """,
                notification_id,
                user_id,
                now,
            )

    def _map_row(self, row: asyncpg.Record) -> Notification:
        return Notification(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            title=row["title"],
            body=row["body"],
            kind=row["kind"],
            link=row["link"],
            read_at=row["read_at"],
            created_at=row["created_at"],
        )


class NotificationService:
    def __init__(self) -> None:
        self._repo = NotificationRepository()

    async def notify_user(
        self,
        user_id: str,
        title: str,
        body: str,
        kind: str,
        link: Optional[str] = None,
    ) -> Notification:
        notif = await self._repo.create(
            user_id=user_id,
            title=title,
            body=body,
            kind=kind,
            link=link,
        )
        try:
            await sockets.emit_notification_new(user_id, notif.to_dict())
        except Exception:
            pass # Socket failure shouldn't fail notification creation
        return notif

    async def get_my_notifications(self, user_id: str, *, limit: int = 50) -> List[Notification]:
        return await self._repo.list_for_user(user_id, limit=limit)

    async def mark_read(self, user_id: str, notification_id: str) -> None:
        await self._repo.mark_read(user_id, notification_id)

    async def get_unread_count(self, user_id: str) -> int:
        """Get count of unread notifications for a user."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Ensure table exists
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    link TEXT,
                    read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL
                );
                """
            )
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) as count
                FROM notifications
                WHERE user_id = $1 AND read_at IS NULL
                """,
                user_id,
            )
            return row["count"] if row else 0
