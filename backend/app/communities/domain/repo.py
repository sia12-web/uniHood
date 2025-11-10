"""Async repository helpers for communities domain."""

from __future__ import annotations

import json
from base64 import b64decode, b64encode
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence
from uuid import UUID, uuid4

import asyncpg

from app.communities.domain import models
from app.communities.domain.exceptions import ConflictError, NotFoundError
from app.infra.postgres import get_pool

CursorPair = tuple[datetime, UUID]
NotificationCursorPair = tuple[datetime, int]


def encode_cursor(value: CursorPair) -> str:
	created_at, entity_id = value
	payload = f"{created_at.isoformat()}|{entity_id}"
	return b64encode(payload.encode()).decode()


def decode_cursor(cursor: str) -> CursorPair:
	decoded = b64decode(cursor.encode()).decode()
	created_str, id_str = decoded.split("|", maxsplit=1)
	return datetime.fromisoformat(created_str), UUID(id_str)


def encode_notification_cursor(value: NotificationCursorPair) -> str:
	created_at, notification_id = value
	payload = f"{created_at.isoformat()}|{notification_id}"
	return b64encode(payload.encode()).decode()


def decode_notification_cursor(cursor: str) -> NotificationCursorPair:
	decoded = b64decode(cursor.encode()).decode()
	created_str, id_str = decoded.split("|", maxsplit=1)
	return datetime.fromisoformat(created_str), int(id_str)


class CommunitiesRepository:
	"""Thin data-access layer around asyncpg."""

	# --- Group operations -------------------------------------------------

	async def create_group(
		self,
		*,
		name: str,
		slug: str,
		description: str,
		visibility: str,
		created_by: UUID,
		tags: Sequence[str],
		campus_id: UUID | None,
		avatar_key: str | None,
		cover_key: str | None,
	) -> models.Group:
		pool = await get_pool()
		tags_list = list(tags)
		async with pool.acquire() as conn:
			async with conn.transaction():
				try:
					record = await conn.fetchrow(
					"""
					INSERT INTO group_entity (id, campus_id, name, slug, description, visibility, avatar_key,
						cover_key, tags, created_by)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
					RETURNING *
					""",
					uuid4(),
					str(campus_id) if campus_id else None,
					name,
					slug,
					description,
					visibility,
					avatar_key,
					cover_key,
					tags_list,
					str(created_by),
				)
				except asyncpg.UniqueViolationError as exc:  # type: ignore[attr-defined]
					raise ConflictError("group_slug_exists") from exc
				await conn.execute(
					"""
					INSERT INTO group_member (group_id, user_id, role)
					VALUES ($1, $2, 'owner')
					ON CONFLICT (group_id, user_id) DO UPDATE SET role='owner', updated_at = NOW()
					""",
					record["id"],
					str(created_by),
				)
		return models.Group.model_validate(dict(record))

	async def get_group(self, group_id: UUID) -> models.Group | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow("SELECT * FROM group_entity WHERE id=$1", str(group_id))
		if not record:
			return None
		return models.Group.model_validate(dict(record))

	async def get_group_by_slug(self, slug: str) -> models.Group | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow("SELECT * FROM group_entity WHERE slug=$1", slug)
		return models.Group.model_validate(dict(record)) if record else None

	async def update_group(
		self,
		group_id: UUID,
		*,
		name: Optional[str] = None,
		description: Optional[str] = None,
		visibility: Optional[str] = None,
		avatar_key: Optional[str] = None,
		cover_key: Optional[str] = None,
		tags: Optional[Sequence[str]] = None,
		is_locked: Optional[bool] = None,
	) -> models.Group:
		pool = await get_pool()
		fields: list[str] = []
		values: list[object] = []
		if name is not None:
			fields.append("name=$%d" % (len(values) + 2))
			values.append(name)
		if description is not None:
			fields.append("description=$%d" % (len(values) + 2))
			values.append(description)
		if visibility is not None:
			fields.append("visibility=$%d" % (len(values) + 2))
			values.append(visibility)
		if avatar_key is not None:
			fields.append("avatar_key=$%d" % (len(values) + 2))
			values.append(avatar_key)
		if cover_key is not None:
			fields.append("cover_key=$%d" % (len(values) + 2))
			values.append(cover_key)
		if tags is not None:
			fields.append("tags=$%d" % (len(values) + 2))
			values.append(list(tags))
		if is_locked is not None:
			fields.append("is_locked=$%d" % (len(values) + 2))
			values.append(is_locked)
		if not fields:
			raise ConflictError("no_updates_requested")
		fields.append("updated_at=NOW()")
		query = f"UPDATE group_entity SET {', '.join(fields)} WHERE id=$1 RETURNING *"
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(query, str(group_id), *values)
		if record is None:
			raise NotFoundError("group_not_found")
		return models.Group.model_validate(dict(record))

	async def soft_delete_group(self, group_id: UUID) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			result = await conn.execute(
				"UPDATE group_entity SET deleted_at = NOW() WHERE id=$1 AND deleted_at IS NULL",
				str(group_id),
			)
		if result.split()[0] == "UPDATE" and result.split()[-1] == "0":
			raise NotFoundError("group_not_found")

	async def restore_group(self, group_id: UUID) -> models.Group:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE group_entity
				SET deleted_at = NULL, updated_at = NOW()
				WHERE id=$1 AND deleted_at IS NOT NULL
				RETURNING *
				""",
				str(group_id),
			)
		if not record:
			raise NotFoundError("group_not_found")
		return models.Group.model_validate(dict(record))

	async def list_groups_public(self, *, limit: int, offset: int = 0) -> list[models.Group]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM group_entity
				WHERE visibility='public' AND deleted_at IS NULL
				ORDER BY created_at DESC
				LIMIT $1 OFFSET $2
				""",
				limit,
				offset,
			)
		return [models.Group.model_validate(dict(row)) for row in rows]

	async def search_groups_fallback(
		self,
		*,
		query: str,
		campus_id: str | None,
		limit: int = 10,
		conn: asyncpg.Connection | None = None,
	) -> list[models.Group]:
		if not query:
			return []
		pattern = f"%{query}%"
		conditions = ["deleted_at IS NULL", "(name ILIKE $1 OR description ILIKE $2)"]
		params: list[object] = [pattern, pattern]
		if campus_id:
			conditions.append("(campus_id = $3 OR campus_id IS NULL)")
			params.append(str(campus_id))
			limit_idx = 4
		else:
			limit_idx = 3
		params.append(limit)
		where_clause = " AND ".join(conditions)
		query_sql = f"""
			SELECT *
			FROM group_entity
			WHERE {where_clause}
			ORDER BY created_at DESC
			LIMIT ${limit_idx}
		"""
		if conn is None:
			pool = await get_pool()
			async with pool.acquire() as pooled_conn:
				rows = await pooled_conn.fetch(query_sql, *params)
		else:
			rows = await conn.fetch(query_sql, *params)
		return [models.Group.model_validate(dict(row)) for row in rows]

	async def get_member(self, group_id: UUID, user_id: UUID) -> models.GroupMember | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"SELECT * FROM group_member WHERE group_id=$1 AND user_id=$2",
				str(group_id),
				str(user_id),
			)
		return models.GroupMember.model_validate(dict(record)) if record else None

	async def upsert_member(
		self,
		group_id: UUID,
		user_id: UUID,
		*,
		role: str,
		muted_until: datetime | None = None,
		is_banned: bool | None = None,
	) -> models.GroupMember:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				INSERT INTO group_member (group_id, user_id, role, muted_until, is_banned)
				VALUES ($1, $2, $3, $4, COALESCE($5, FALSE))
				ON CONFLICT (group_id, user_id)
				DO UPDATE SET role=EXCLUDED.role,
					muted_until=COALESCE($4, group_member.muted_until),
					is_banned=COALESCE($5, group_member.is_banned),
					updated_at=NOW()
				RETURNING *
				""",
				str(group_id),
				str(user_id),
				role,
				muted_until,
				is_banned,
			)
		return models.GroupMember.model_validate(dict(record))

	async def update_member_properties(
		self,
		group_id: UUID,
		user_id: UUID,
		*,
		role: str | None = None,
		muted_until: datetime | None = None,
		is_banned: bool | None = None,
	) -> models.GroupMember:
		assignments: list[str] = []
		params: list[object] = []
		if role is not None:
			assignments.append("role=$%d" % (len(params) + 3))
			params.append(role)
		if muted_until is not None:
			assignments.append("muted_until=$%d" % (len(params) + 3))
			params.append(muted_until)
		if is_banned is not None:
			assignments.append("is_banned=$%d" % (len(params) + 3))
			params.append(is_banned)
		if not assignments:
			raise ConflictError("no_member_updates_requested")
		assignments.append("updated_at=NOW()")
		query = f"""
			UPDATE group_member
			SET {', '.join(assignments)}
			WHERE group_id=$1 AND user_id=$2
			RETURNING *
		"""
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(query, str(group_id), str(user_id), *params)
		if not record:
			raise NotFoundError("member_not_found")
		return models.GroupMember.model_validate(dict(record))

	async def clear_member_moderation(
		self,
		*,
		group_id: UUID,
		user_id: UUID,
		clear_ban: bool,
		clear_mute: bool,
	) -> models.GroupMember:
		if not clear_ban and not clear_mute:
			raise ConflictError("no_member_updates_requested")
		set_clauses: list[str] = []
		if clear_ban:
			set_clauses.append("is_banned = FALSE")
		if clear_mute:
			set_clauses.append("muted_until = NULL")
		set_clauses.append("updated_at = NOW()")
		query = f"""
			UPDATE group_member
			SET {', '.join(set_clauses)}
			WHERE group_id=$1 AND user_id=$2
			RETURNING *
		"""
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(query, str(group_id), str(user_id))
		if not record:
			raise NotFoundError("member_not_found")
		return models.GroupMember.model_validate(dict(record))

	async def delete_member(self, group_id: UUID, user_id: UUID) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.execute(
				"DELETE FROM group_member WHERE group_id=$1 AND user_id=$2",
				str(group_id),
				str(user_id),
			)

	async def list_members(self, group_id: UUID) -> list[models.GroupMember]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"SELECT * FROM group_member WHERE group_id=$1 ORDER BY joined_at ASC",
				str(group_id),
			)
		return [models.GroupMember.model_validate(dict(row)) for row in rows]

	# --- Post operations --------------------------------------------------

	async def create_post(
		self,
		*,
		group_id: UUID,
		author_id: UUID,
		title: str | None,
		body: str,
		topic_tags: Sequence[str],
	) -> models.Post:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					INSERT INTO post (id, group_id, author_id, title, body, topic_tags)
					VALUES ($1, $2, $3, $4, $5, $6)
					RETURNING *
					""",
					uuid4(),
					str(group_id),
					str(author_id),
					title,
					body,
					list(topic_tags),
				)
				await conn.execute(
					"UPDATE group_entity SET updated_at = NOW() WHERE id=$1",
					str(group_id),
				)
		return models.Post.model_validate(dict(record))

	async def get_post(self, post_id: UUID) -> models.Post | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow("SELECT * FROM post WHERE id=$1", str(post_id))
		return models.Post.model_validate(dict(record)) if record else None

	async def list_posts(
		self,
		group_id: UUID,
		*,
		limit: int,
		after: CursorPair | None = None,
		before: CursorPair | None = None,
	) -> tuple[list[models.Post], str | None]:
		pool = await get_pool()
		conditions = ["group_id=$1", "deleted_at IS NULL"]
		params: list[object] = [str(group_id)]
		if after:
			params.extend([after[0], str(after[1])])
			conditions.append("(created_at, id) < ($%d, $%d)" % (len(params) - 1, len(params)))
		if before:
			params.extend([before[0], str(before[1])])
			conditions.append("(created_at, id) > ($%d, $%d)" % (len(params) - 1, len(params)))
		where_clause = " AND ".join(conditions)
		query = f"""
			SELECT * FROM post
			WHERE {where_clause}
			ORDER BY created_at DESC, id DESC
			LIMIT $%d
		""" % (len(params) + 1)
		params.append(limit + 1)
		async with pool.acquire() as conn:
			rows = await conn.fetch(query, *params)
		items = [models.Post.model_validate(dict(row)) for row in rows]
		next_cursor = None
		if len(items) > limit:
			items.pop()  # drop sentinel row
			if items:
				tail = items[-1]
				next_cursor = encode_cursor((tail.created_at, tail.id))
		return items, next_cursor

	async def update_post(
		self,
		post_id: UUID,
		*,
		title: str | None,
		body: str | None,
		topic_tags: Sequence[str] | None,
		is_pinned: bool | None,
	) -> models.Post:
		assignments: list[str] = []
		params: list[object] = []
		if title is not None:
			assignments.append("title=$%d" % (len(params) + 2))
			params.append(title)
		if body is not None:
			assignments.append("body=$%d" % (len(params) + 2))
			params.append(body)
		if topic_tags is not None:
			assignments.append("topic_tags=$%d" % (len(params) + 2))
			params.append(list(topic_tags))
		if is_pinned is not None:
			assignments.append("is_pinned=$%d" % (len(params) + 2))
			params.append(is_pinned)
		if not assignments:
			raise ConflictError("no_post_updates_requested")
		assignments.append("updated_at=NOW()")
		query = f"UPDATE post SET {', '.join(assignments)} WHERE id=$1 RETURNING *"
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(query, str(post_id), *params)
		if not record:
			raise NotFoundError("post_not_found")
		return models.Post.model_validate(dict(record))

	async def soft_delete_post(self, post_id: UUID) -> models.Post:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE post SET deleted_at = NOW(), updated_at = NOW()
				WHERE id=$1 AND deleted_at IS NULL
				RETURNING *
				""",
				str(post_id),
			)
		if not record:
			raise NotFoundError("post_not_found")
		return models.Post.model_validate(dict(record))

	async def restore_post(self, post_id: UUID) -> models.Post:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE post
				SET deleted_at = NULL, updated_at = NOW()
				WHERE id=$1 AND deleted_at IS NOT NULL
				RETURNING *
				""",
				str(post_id),
			)
		if not record:
			raise NotFoundError("post_not_found")
		return models.Post.model_validate(dict(record))

	# --- Comment operations -----------------------------------------------

	async def create_comment(
		self,
		*,
		post_id: UUID,
		author_id: UUID,
		body: str,
		parent_id: UUID | None,
		depth: int,
	) -> models.Comment:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					INSERT INTO comment (id, post_id, author_id, parent_id, body, depth)
					VALUES ($1, $2, $3, $4, $5, $6)
					RETURNING *
					""",
					uuid4(),
					str(post_id),
					str(author_id),
					str(parent_id) if parent_id else None,
					body,
					depth,
				)
				await conn.execute(
					"""
					UPDATE post SET comments_count = comments_count + 1, updated_at = NOW()
					WHERE id=$1
					""",
					str(post_id),
				)
		return models.Comment.model_validate(dict(record))

	async def list_comments(
		self,
		post_id: UUID,
		*,
		limit: int,
		after: CursorPair | None = None,
		before: CursorPair | None = None,
	) -> tuple[list[models.Comment], str | None]:
		pool = await get_pool()
		conditions = ["post_id=$1", "deleted_at IS NULL"]
		params: list[object] = [str(post_id)]
		if after:
			params.extend([after[0], str(after[1])])
			conditions.append("(created_at, id) > ($%d, $%d)" % (len(params) - 1, len(params)))
		if before:
			params.extend([before[0], str(before[1])])
			conditions.append("(created_at, id) < ($%d, $%d)" % (len(params) - 1, len(params)))
		where_clause = " AND ".join(conditions)
		query = f"""
			SELECT * FROM comment
			WHERE {where_clause}
			ORDER BY created_at ASC, id ASC
			LIMIT $%d
		""" % (len(params) + 1)
		params.append(limit + 1)
		async with pool.acquire() as conn:
			rows = await conn.fetch(query, *params)
		items = [models.Comment.model_validate(dict(row)) for row in rows]
		next_cursor = None
		if len(items) > limit:
			last = items.pop()
			next_cursor = encode_cursor((last.created_at, last.id))
		return items, next_cursor

	async def get_comment(self, comment_id: UUID) -> models.Comment | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow("SELECT * FROM comment WHERE id=$1", str(comment_id))
		return models.Comment.model_validate(dict(record)) if record else None

	async def update_comment(self, comment_id: UUID, *, body: str | None) -> models.Comment:
		if body is None:
			raise ConflictError("no_comment_updates_requested")
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE comment SET body=$2, updated_at = NOW()
				WHERE id=$1
				RETURNING *
				""",
				str(comment_id),
				body,
			)
		if not record:
			raise NotFoundError("comment_not_found")
		return models.Comment.model_validate(dict(record))

	async def soft_delete_comment(self, comment_id: UUID) -> models.Comment:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					UPDATE comment SET deleted_at = NOW(), updated_at = NOW()
					WHERE id=$1 AND deleted_at IS NULL
					RETURNING *
					""",
					str(comment_id),
				)
				if not record:
					raise NotFoundError("comment_not_found")
				await conn.execute(
					"""
					UPDATE post SET comments_count = GREATEST(comments_count - 1, 0), updated_at = NOW()
					WHERE id=$1
					""",
					str(record["post_id"]),
				)
		return models.Comment.model_validate(dict(record))

	async def restore_comment(self, comment_id: UUID) -> models.Comment:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					UPDATE comment
					SET deleted_at = NULL, updated_at = NOW()
					WHERE id=$1 AND deleted_at IS NOT NULL
					RETURNING *
					""",
					str(comment_id),
				)
				if not record:
					raise NotFoundError("comment_not_found")
				await conn.execute(
					"""
					UPDATE post SET comments_count = comments_count + 1, updated_at = NOW()
					WHERE id=$1
					""",
					str(record["post_id"]),
				)
		return models.Comment.model_validate(dict(record))

	# --- Reactions --------------------------------------------------------

	async def add_reaction(
		self,
		*,
		subject_type: str,
		subject_id: UUID,
		user_id: UUID,
		emoji: str,
		effective_weight: float = 1.0,
	) -> models.Reaction:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				try:
					record = await conn.fetchrow(
						"""
						INSERT INTO reaction (id, subject_type, subject_id, user_id, emoji, effective_weight)
						VALUES ($1, $2, $3, $4, $5, $6)
						RETURNING *
						""",
						uuid4(),
						subject_type,
						str(subject_id),
						str(user_id),
						emoji,
						effective_weight,
					)
				except asyncpg.UniqueViolationError as exc:  # type: ignore[attr-defined]
					raise ConflictError("reaction_exists") from exc
				if subject_type == "post":
					await conn.execute(
						"UPDATE post SET reactions_count = reactions_count + 1 WHERE id=$1",
						str(subject_id),
					)
				else:
					await conn.execute(
						"UPDATE comment SET reactions_count = reactions_count + 1 WHERE id=$1",
						str(subject_id),
					)
		return models.Reaction.model_validate(dict(record))

	async def remove_reaction(self, *, subject_type: str, subject_id: UUID, user_id: UUID, emoji: str) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				deleted = await conn.execute(
					"""
					DELETE FROM reaction
					WHERE subject_type=$1 AND subject_id=$2 AND user_id=$3 AND emoji=$4
					""",
					subject_type,
					str(subject_id),
					str(user_id),
					emoji,
				)
				if deleted.split()[-1] == "0":
					raise NotFoundError("reaction_not_found")
				if subject_type == "post":
					await conn.execute(
						"UPDATE post SET reactions_count = GREATEST(reactions_count - 1, 0) WHERE id=$1",
						str(subject_id),
					)
				else:
					await conn.execute(
						"UPDATE comment SET reactions_count = GREATEST(reactions_count - 1, 0) WHERE id=$1",
						str(subject_id),
					)

	# --- Attachments ------------------------------------------------------

	async def count_attachments(self, *, subject_type: str, subject_id: UUID) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			value = await conn.fetchval(
				"SELECT COUNT(*) FROM media_attachment WHERE subject_type=$1 AND subject_id=$2",
				subject_type,
				str(subject_id),
			)
		return int(value or 0)

	async def create_attachment(
		self,
		*,
		subject_type: str,
		subject_id: UUID,
		s3_key: str,
		mime: str,
		size_bytes: int,
		width: int | None,
		height: int | None,
		created_by: UUID,
	) -> models.MediaAttachment:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					INSERT INTO media_attachment
					(id, subject_type, subject_id, s3_key, mime, size_bytes, width, height, created_by)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
					RETURNING *
					""",
					uuid4(),
					subject_type,
					str(subject_id),
					s3_key,
					mime,
					size_bytes,
					width,
					height,
					str(created_by),
				)
				if subject_type == "post":
					await conn.execute(
						"UPDATE post SET media_count = media_count + 1 WHERE id=$1",
						str(subject_id),
					)
		return models.MediaAttachment.model_validate(dict(record))

	# --- Topic tags -------------------------------------------------------

	async def search_tags(self, *, query: str, limit: int = 10) -> list[str]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT tag FROM topic_tag
				WHERE tag ILIKE $1
				ORDER BY tag ASC
				LIMIT $2
				""",
				f"{query}%",
				limit,
			)
		return [row["tag"] for row in rows]

	async def ensure_tags(self, tags: Iterable[str]) -> None:
		if not tags:
			return
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.executemany(
				"INSERT INTO topic_tag (id, tag) VALUES ($1, $2) ON CONFLICT (tag) DO NOTHING",
				[(uuid4(), tag) for tag in tags],
			)

	# --- Event operations -------------------------------------------------

	async def create_event(
		self,
		*,
		group_id: UUID,
		campus_id: UUID | None,
		title: str,
		description: str,
		venue_id: UUID | None,
		start_at: datetime,
		end_at: datetime,
		all_day: bool,
		capacity: int | None,
		visibility: str,
		rrule: str | None,
		allow_guests: bool,
		created_by: UUID,
	) -> tuple[models.Event, models.EventCounter]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					INSERT INTO event_entity (
						group_id,
						campus_id,
						title,
						description,
						venue_id,
						start_at,
						end_at,
						all_day,
						capacity,
						visibility,
						rrule,
						allow_guests,
						created_by
					)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
					RETURNING *
					""",
					str(group_id),
					str(campus_id) if campus_id else None,
					title,
					description,
					str(venue_id) if venue_id else None,
					start_at,
					end_at,
					all_day,
					capacity,
					visibility,
					rrule,
					allow_guests,
					str(created_by),
				)
				counter_row = await conn.fetchrow(
					"""
					INSERT INTO event_counter (event_id)
					VALUES ($1)
					ON CONFLICT (event_id) DO UPDATE SET updated_at = NOW()
					RETURNING event_id, going, waitlisted, interested, updated_at
					""",
					record["id"],
				)
		event = models.Event.model_validate(dict(record))
		counter = models.EventCounter.model_validate(dict(counter_row)) if counter_row else models.EventCounter(
			event_id=event.id,
			going=0,
			waitlisted=0,
			interested=0,
			updated_at=datetime.now(timezone.utc),
		)
		return event, counter

	async def update_event(
		self,
		*,
		event_id: UUID,
		payload: dict[str, object],
	) -> models.Event | None:
		if not payload:
			return await self.get_event(event_id)
		set_clauses: list[str] = []
		params: list[object] = []
		for column, value in payload.items():
			set_clauses.append(f"{column}=${len(params) + 1}")
			if isinstance(value, UUID):
				params.append(str(value))
			else:
				params.append(value)
		params.append(str(event_id))
		query = f"""
			UPDATE event_entity
			SET {', '.join(set_clauses)}, updated_at = NOW()
			WHERE id=${len(params)}
			RETURNING *
		"""
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(query, *params)
		if not record:
			return None
		return models.Event.model_validate(dict(record))

	async def soft_delete_event(self, event_id: UUID) -> models.Event | None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE event_entity
				SET deleted_at = NOW(), updated_at = NOW()
				WHERE id=$1 AND deleted_at IS NULL
				RETURNING *
				""",
				str(event_id),
			)
		if not record:
			return None
		return models.Event.model_validate(dict(record))

	async def restore_event(self, event_id: UUID) -> models.Event:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE event_entity
				SET deleted_at = NULL, updated_at = NOW()
				WHERE id=$1 AND deleted_at IS NOT NULL
				RETURNING *
				""",
				str(event_id),
			)
		if not record:
			raise NotFoundError("event_not_found")
		return models.Event.model_validate(dict(record))

	async def get_event(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection | None = None,
		for_update: bool = False,
	) -> models.Event | None:
		query = "SELECT * FROM event_entity WHERE id=$1"
		if for_update:
			query += " FOR UPDATE"
		async def _fetch(connection: asyncpg.Connection) -> models.Event | None:
			record = await connection.fetchrow(query, str(event_id))
			return models.Event.model_validate(dict(record)) if record else None
		if conn is not None:
			return await _fetch(conn)
		pool = await get_pool()
		async with pool.acquire() as pooled_conn:
			return await _fetch(pooled_conn)

	async def list_group_events(
		self,
		group_id: UUID,
		*,
		limit: int,
		after: str | None = None,
		scope: str | None = None,
	) -> tuple[list[tuple[models.Event, models.EventCounter]], str | None]:
		pool = await get_pool()
		params: list[object] = [str(group_id)]
		where_clauses = ["e.group_id=$1", "e.deleted_at IS NULL"]
		if scope == "upcoming":
			where_clauses.append("e.start_at >= NOW()")
		elif scope == "past":
			where_clauses.append("e.start_at < NOW()")
		cursor_pair: CursorPair | None = None
		if after:
			cursor_pair = decode_cursor(after)
			ts, cursor_id = cursor_pair
			params.extend([ts, str(cursor_id)])
			where_clauses.append(
				"(e.start_at, e.id) > ($%d, $%d)" % (len(params) - 1, len(params)),
			)
		params.append(limit + 1)
		query = """
			SELECT e.*, c.going, c.waitlisted, c.interested, c.updated_at AS counter_updated_at
			FROM event_entity e
			LEFT JOIN event_counter c ON c.event_id = e.id
			WHERE {where}
			ORDER BY e.start_at ASC, e.id ASC
			LIMIT $%d
		""".format(where=" AND ".join(where_clauses)) % len(params)
		async with pool.acquire() as conn:
			rows = await conn.fetch(query, *params)
		events: list[tuple[models.Event, models.EventCounter]] = []
		for row in rows[:limit]:
			event = models.Event.model_validate(dict(row))
			counter = self._row_to_event_counter(row)
			events.append((event, counter))
		next_cursor: str | None = None
		if len(rows) > limit:
			last_row = rows[limit]
			next_cursor = encode_cursor((last_row["start_at"], last_row["id"]))
		return events, next_cursor

	async def get_event_with_counter(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection | None = None,
		for_update: bool = False,
	) -> tuple[models.Event, models.EventCounter] | None:
		async def _fetch(connection: asyncpg.Connection):
			query = """
				SELECT e.*, c.going, c.waitlisted, c.interested, c.updated_at AS counter_updated_at
				FROM event_entity e
				LEFT JOIN event_counter c ON c.event_id = e.id
				WHERE e.id=$1
			"""
			if for_update:
				query += " FOR UPDATE"
			row = await connection.fetchrow(query, str(event_id))
			if not row:
				return None
			return models.Event.model_validate(dict(row)), self._row_to_event_counter(row)
		if conn is not None:
			return await _fetch(conn)
		pool = await get_pool()
		async with pool.acquire() as pooled_conn:
			return await _fetch(pooled_conn)

	async def ensure_event_counter(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection,
	) -> None:
		await conn.execute(
			"INSERT INTO event_counter (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING",
			str(event_id),
		)

	async def list_events_waitlist_candidates(
		self,
		*,
		limit: int,
		conn: asyncpg.Connection | None = None,
	) -> list[UUID]:
		query = """
			SELECT e.id
			FROM event_entity e
			JOIN event_counter c ON c.event_id = e.id
			WHERE e.deleted_at IS NULL
				AND e.capacity IS NOT NULL
				AND c.waitlisted > 0
				AND c.going < e.capacity
			ORDER BY e.start_at ASC
			LIMIT $1
		"""
		async def _fetch(connection: asyncpg.Connection) -> list[UUID]:
			rows = await connection.fetch(query, limit)
			return [UUID(str(row["id"])) for row in rows]
		if conn is not None:
			return await _fetch(conn)
		pool = await get_pool()
		async with pool.acquire() as pooled_conn:
			return await _fetch(pooled_conn)

	async def adjust_event_counter(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection,
		going_delta: int = 0,
		waitlisted_delta: int = 0,
		interested_delta: int = 0,
	) -> models.EventCounter:
		await self.ensure_event_counter(event_id, conn=conn)
		row = await conn.fetchrow(
			"""
				UPDATE event_counter
				SET going = going + $2,
					waitlisted = waitlisted + $3,
					interested = interested + $4,
					updated_at = NOW()
				WHERE event_id = $1
				RETURNING event_id, going, waitlisted, interested, updated_at
			""",
			str(event_id),
			going_delta,
			waitlisted_delta,
			interested_delta,
		)
		return models.EventCounter.model_validate(dict(row)) if row else models.EventCounter(
			event_id=event_id,
			going=0,
			waitlisted=0,
			interested=0,
			updated_at=datetime.now(timezone.utc),
		)

	async def get_event_counter(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection | None = None,
		for_update: bool = False,
	) -> models.EventCounter:
		query = "SELECT event_id, going, waitlisted, interested, updated_at FROM event_counter WHERE event_id=$1"
		if for_update:
			query += " FOR UPDATE"
		async def _fetch(connection: asyncpg.Connection) -> models.EventCounter:
			row = await connection.fetchrow(query, str(event_id))
			if not row:
				return models.EventCounter(
					event_id=event_id,
					going=0,
					waitlisted=0,
					interested=0,
					updated_at=datetime.now(timezone.utc),
				)
			return models.EventCounter.model_validate(dict(row))
		if conn is not None:
			return await _fetch(conn)
		pool = await get_pool()
		async with pool.acquire() as pooled_conn:
			return await _fetch(pooled_conn)

	async def get_event_venue(
		self,
		venue_id: UUID,
		*,
		conn: asyncpg.Connection | None = None,
	) -> models.EventVenue | None:
		query = "SELECT * FROM event_venue WHERE id=$1"
		async def _fetch(connection: asyncpg.Connection) -> models.EventVenue | None:
			record = await connection.fetchrow(query, str(venue_id))
			return models.EventVenue.model_validate(dict(record)) if record else None
		if conn is not None:
			return await _fetch(conn)
		pool = await get_pool()
		async with pool.acquire() as pooled_conn:
			return await _fetch(pooled_conn)

	async def upsert_event_rsvp(
		self,
		*,
		conn: asyncpg.Connection,
		event_id: UUID,
		user_id: UUID,
		status: str,
		guests: int,
	) -> models.EventRSVP:
		row = await conn.fetchrow(
			"""
				INSERT INTO event_rsvp (event_id, user_id, status, guests)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (event_id, user_id)
				DO UPDATE SET status = EXCLUDED.status,
					guests = EXCLUDED.guests,
					updated_at = NOW()
				RETURNING *
			""",
			str(event_id),
			str(user_id),
			status,
			guests,
		)
		return models.EventRSVP.model_validate(dict(row))

	async def get_event_rsvp(
		self,
		*,
		conn: asyncpg.Connection,
		event_id: UUID,
		user_id: UUID,
	) -> models.EventRSVP | None:
		row = await conn.fetchrow(
			"""
				SELECT * FROM event_rsvp
				WHERE event_id=$1 AND user_id=$2
			""",
			str(event_id),
			str(user_id),
		)
		return models.EventRSVP.model_validate(dict(row)) if row else None

	async def delete_event_rsvp(
		self,
		*,
		conn: asyncpg.Connection,
		event_id: UUID,
		user_id: UUID,
	) -> models.EventRSVP | None:
		row = await conn.fetchrow(
			"""
				DELETE FROM event_rsvp
				WHERE event_id=$1 AND user_id=$2
				RETURNING *
			""",
			str(event_id),
			str(user_id),
		)
		return models.EventRSVP.model_validate(dict(row)) if row else None

	async def list_waitlisted_rsvps(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection,
		limit: int,
	) -> list[models.EventRSVP]:
		rows = await conn.fetch(
			"""
				SELECT * FROM event_rsvp
				WHERE event_id=$1 AND status='waitlisted'
				ORDER BY created_at ASC
				LIMIT $2
			""",
			str(event_id),
			limit,
		)
		return [models.EventRSVP.model_validate(dict(row)) for row in rows]

	async def list_event_rsvps(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection,
		statuses: Sequence[str] | None = None,
	) -> list[models.EventRSVP]:
		params: list[object] = [str(event_id)]
		where = ["event_id=$1"]
		if statuses:
			params.append(list(statuses))
			where.append("status = ANY($2::text[])")
		query = """
			SELECT * FROM event_rsvp
			WHERE {where}
			ORDER BY created_at ASC
		""".format(where=" AND ".join(where))
		rows = await conn.fetch(query, *params)
		return [models.EventRSVP.model_validate(dict(row)) for row in rows]

	async def count_event_rsvps(
		self,
		event_id: UUID,
		*,
		conn: asyncpg.Connection,
	) -> models.EventCounter:
		await self.ensure_event_counter(event_id, conn=conn)
		row = await conn.fetchrow(
			"""
				SELECT event_id, going, waitlisted, interested, updated_at
				FROM event_counter
				WHERE event_id=$1
			""",
			str(event_id),
		)
		return models.EventCounter.model_validate(dict(row)) if row else models.EventCounter(
			event_id=event_id,
			going=0,
			waitlisted=0,
			interested=0,
			updated_at=datetime.now(timezone.utc),
		)

	def _row_to_event_counter(self, row: asyncpg.Record) -> models.EventCounter:
		data = dict(row)
		return models.EventCounter(
			event_id=data.get("id", data["event_id"]),
			going=(data.get("going") or 0),
			waitlisted=(data.get("waitlisted") or 0),
			interested=(data.get("interested") or 0),
			updated_at=data.get("counter_updated_at", datetime.now(timezone.utc)),
		)

	# --- Outbox -----------------------------------------------------------

	async def enqueue_outbox(
		self,
		*,
		conn: asyncpg.Connection,
		aggregate_type: str,
		aggregate_id: UUID,
		event_type: str,
		payload: dict,
	) -> None:
		await conn.execute(
			"""
			INSERT INTO outbox_event (aggregate_type, aggregate_id, event_type, payload)
			VALUES ($1, $2, $3, $4)
			""",
			aggregate_type,
			str(aggregate_id),
			event_type,
			payload,
		)

	async def fetch_outbox_batch(self, *, limit: int = 500, conn: asyncpg.Connection | None = None) -> list[models.OutboxEvent]:
		if conn is None:
			pool = await get_pool()
			async with pool.acquire() as pooled_conn:
				return await self.fetch_outbox_batch(limit=limit, conn=pooled_conn)
		rows = await conn.fetch(
			"""
			SELECT * FROM outbox_event
			WHERE processed_at IS NULL
			ORDER BY id
			LIMIT $1
			FOR UPDATE SKIP LOCKED
			""",
			limit,
		)
		return [models.OutboxEvent.model_validate(dict(row)) for row in rows]

	async def mark_outbox_processed(
		self,
		*,
		ids: Sequence[int],
		conn: asyncpg.Connection | None = None,
	) -> None:
		if not ids:
			return
		if conn is None:
			pool = await get_pool()
			async with pool.acquire() as pooled_conn:
				await self.mark_outbox_processed(ids=ids, conn=pooled_conn)
			return
		await conn.execute(
			"UPDATE outbox_event SET processed_at = NOW() WHERE id = ANY($1)",
			ids,
		)

	# --- Feed operations -------------------------------------------------

	async def list_member_ids(self, group_id: UUID) -> list[UUID]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT user_id
				FROM group_member
				WHERE group_id=$1 AND is_banned=FALSE
				""",
				str(group_id),
			)
		return [row["user_id"] for row in rows]

	async def bulk_upsert_feed_entries(
		self,
		entries: Sequence[tuple[UUID, UUID, UUID, float]],
	) -> None:
		if not entries:
			return
		pool = await get_pool()
		payload = [
			(str(owner), str(post), str(group), float(rank))
			for owner, post, group, rank in entries
		]
		async with pool.acquire() as conn:
			await conn.executemany(
				"""
				INSERT INTO feed_entry (owner_id, post_id, group_id, rank_score)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (owner_id, post_id)
				DO UPDATE SET rank_score = EXCLUDED.rank_score,
					inserted_at = NOW(),
					deleted_at = NULL
				""",
				payload,
			)

	async def mark_feed_entries_deleted(self, post_id: UUID) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			result = await conn.execute(
				"""
				UPDATE feed_entry
				SET deleted_at = NOW()
				WHERE post_id=$1 AND deleted_at IS NULL
				""",
				str(post_id),
			)
		return int(result.split()[-1])

	async def list_feed_owner_ids_for_post(self, post_id: UUID) -> list[UUID]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT owner_id
				FROM feed_entry
				WHERE post_id=$1 AND deleted_at IS NULL
				""",
				str(post_id),
			)
		return [row["owner_id"] for row in rows]

	async def list_user_feed_entries(
		self,
		owner_id: UUID,
		*,
		limit: int,
		after: tuple[float, UUID] | None = None,
	) -> tuple[list[models.FeedEntry], tuple[float, UUID] | None]:
		pool = await get_pool()
		params: list[object] = [str(owner_id)]
		where_clauses = ["owner_id=$1", "deleted_at IS NULL"]
		if after:
			score, post_id = after
			params.extend([score, str(post_id)])
			where_clauses.append(
				"(rank_score < $2 OR (rank_score = $2 AND post_id::text < $3))"
			)
		query = """
			SELECT * FROM feed_entry
			WHERE {where}
			ORDER BY rank_score DESC, inserted_at DESC, post_id DESC
			LIMIT $%d
		""".format(where=" AND ".join(where_clauses)) % (len(params) + 1)
		params.append(limit + 1)
		async with pool.acquire() as conn:
			rows = await conn.fetch(query, *params)
		entries = [models.FeedEntry.model_validate(dict(row)) for row in rows]
		next_cursor: tuple[float, UUID] | None = None
		if len(entries) > limit:
			last = entries.pop()
			next_cursor = (float(last.rank_score), UUID(str(last.post_id)))
		return entries, next_cursor

	async def fetch_feed_entries_by_posts(
		self,
		owner_id: UUID,
		post_ids: Sequence[UUID],
	) -> list[models.FeedEntry]:
		if not post_ids:
			return []
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM feed_entry
				WHERE owner_id=$1 AND post_id = ANY($2::uuid[])
				AND deleted_at IS NULL
				""",
				str(owner_id),
				[str(pid) for pid in post_ids],
			)
		return [models.FeedEntry.model_validate(dict(row)) for row in rows]

	async def list_recent_posts(self, *, hours: int) -> list[models.Post]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM post
				WHERE deleted_at IS NULL
				AND created_at >= NOW() - ($1::text || ' hours')::interval
				""",
				hours,
			)
		return [models.Post.model_validate(dict(row)) for row in rows]

	async def list_recent_posts_for_group(
		self,
		group_id: UUID,
		*,
		limit: int,
	) -> list[models.Post]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM post
				WHERE group_id=$1 AND deleted_at IS NULL
				ORDER BY created_at DESC
				LIMIT $2
				""",
				str(group_id),
				limit,
			)
		return [models.Post.model_validate(dict(row)) for row in rows]

	async def list_group_ids_for_user(self, user_id: UUID) -> list[UUID]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT group_id
				FROM group_member
				WHERE user_id=$1 AND is_banned = FALSE
				""",
				str(user_id),
			)
		return [row["group_id"] for row in rows]

	async def delete_feed_entries_for_user(self, owner_id: UUID) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.execute(
				"DELETE FROM feed_entry WHERE owner_id=$1",
				str(owner_id),
			)

	async def update_feed_rank_for_post(self, post_id: UUID, *, rank_score: float) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				UPDATE feed_entry
				SET rank_score=$2, inserted_at=NOW()
				WHERE post_id=$1
				""",
				str(post_id),
				rank_score,
			)

	async def fetch_feed_entries_for_post(self, post_id: UUID) -> list[models.FeedEntry]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM feed_entry
				WHERE post_id=$1 AND deleted_at IS NULL
				""",
				str(post_id),
			)
		return [models.FeedEntry.model_validate(dict(row)) for row in rows]

	# --- Notification operations ---------------------------------------------

	async def insert_notification(
		self,
		*,
		user_id: UUID,
		type: str,
		ref_id: UUID,
		actor_id: UUID,
		payload: dict,
		dedupe_window_seconds: int = 600,
		max_per_second: int = 5,
	) -> tuple[models.NotificationEntity | None, bool]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				existing = await conn.fetchrow(
					"""
					SELECT *
					FROM notification_entity
					WHERE user_id=$1 AND type=$2 AND ref_id=$3
					AND created_at >= NOW() - ($4::text || ' seconds')::interval
					ORDER BY created_at DESC
					LIMIT 1
					""",
					str(user_id),
					type,
					str(ref_id),
					dedupe_window_seconds,
				)
				if existing:
					return models.NotificationEntity.model_validate(dict(existing)), False

				recent_count = await conn.fetchval(
					"""
					SELECT COUNT(*)
					FROM notification_entity
					WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '1 second'
					""",
					str(user_id),
				)
				if int(recent_count or 0) >= max_per_second:
					return None, False

				record = await conn.fetchrow(
					"""
					INSERT INTO notification_entity (user_id, type, ref_id, actor_id, payload)
					VALUES ($1, $2, $3, $4, $5::jsonb)
					RETURNING *
					""",
					str(user_id),
					type,
					str(ref_id),
					str(actor_id),
					json.dumps(payload),
				)
				await conn.execute(
					"""
					INSERT INTO unread_counter (user_id, count, updated_at)
					VALUES ($1, 1, NOW())
					ON CONFLICT (user_id)
					DO UPDATE SET count = unread_counter.count + 1, updated_at = NOW()
					""",
					str(user_id),
				)
			return models.NotificationEntity.model_validate(dict(record)), True

	async def list_notifications(
		self,
		user_id: UUID,
		*,
		limit: int,
		after: NotificationCursorPair | None = None,
	) -> tuple[list[models.NotificationEntity], str | None]:
		pool = await get_pool()
		params: list[object] = [str(user_id)]
		conditions = ["user_id=$1"]
		if after:
			params.extend([after[0], after[1]])
			conditions.append(
				"(created_at, id) < ($%d, $%d)" % (len(params) - 1, len(params))
			)
		where_clause = " AND ".join(conditions)
		query = f"""
			SELECT * FROM notification_entity
			WHERE {where_clause}
			ORDER BY created_at DESC, id DESC
			LIMIT ${len(params) + 1}
		"""
		params.append(limit + 1)
		async with pool.acquire() as conn:
			rows = await conn.fetch(query, *params)
		items = [models.NotificationEntity.model_validate(dict(row)) for row in rows]
		next_cursor: str | None = None
		if len(items) > limit:
			items.pop()
			if items:
				tail = items[-1]
				next_cursor = encode_notification_cursor((tail.created_at, int(tail.id)))
		return items, next_cursor

	async def mark_notifications_read(
		self,
		user_id: UUID,
		*,
		ids: list[int],
		mark_read: bool,
	) -> int:
		if not ids:
			return 0
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				UPDATE notification_entity
				SET is_read=$3
				WHERE user_id=$1 AND id = ANY($2::bigint[])
				RETURNING id
				""",
				str(user_id),
				[ int(x) for x in ids ],
				mark_read,
			)
			count = await conn.fetchval(
				"""
				SELECT COUNT(*)
				FROM notification_entity
				WHERE user_id=$1 AND is_read = FALSE
				""",
				str(user_id),
			)
			await conn.execute(
				"""
				INSERT INTO unread_counter (user_id, count, updated_at)
				VALUES ($1, $2, NOW())
				ON CONFLICT (user_id)
				DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()
				""",
				str(user_id),
				int(count or 0),
			)
		return len(rows)

	async def get_unread_count(self, user_id: UUID) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			value = await conn.fetchval(
				"""
				SELECT count FROM unread_counter WHERE user_id=$1
				""",
				str(user_id),
			)
			if value is None:
				value = await conn.fetchval(
					"""
					SELECT COUNT(*) FROM notification_entity WHERE user_id=$1 AND is_read=FALSE
					""",
					str(user_id),
				)
				await conn.execute(
					"""
					INSERT INTO unread_counter (user_id, count, updated_at)
					VALUES ($1, $2, NOW())
					ON CONFLICT (user_id)
					DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()
					""",
					str(user_id),
					int(value or 0),
				)
		return int(value or 0)

	async def prune_old_notifications(self, *, older_than_days: int) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			result = await conn.execute(
				"""
				DELETE FROM notification_entity
				WHERE created_at < NOW() - ($1::text || ' days')::interval
				""",
				older_than_days,
			)
		return int(result.split()[-1]) if result else 0

	async def rebuild_unread_counters(self) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				insert_result = await conn.execute(
					"""
					WITH counts AS (
						SELECT user_id, COUNT(*) AS unread_count
						FROM notification_entity
						WHERE is_read = FALSE
						GROUP BY user_id
					)
					INSERT INTO unread_counter (user_id, count, updated_at)
					SELECT user_id, unread_count, NOW()
					FROM counts
					ON CONFLICT (user_id)
					DO UPDATE SET count = EXCLUDED.count, updated_at = NOW()
					"""
				)
				update_result = await conn.execute(
					"""
					UPDATE unread_counter
					SET count = 0, updated_at = NOW()
					WHERE user_id NOT IN (
						SELECT DISTINCT user_id
						FROM notification_entity
						WHERE is_read = FALSE
					)
					AND count <> 0
					"""
				)
			inserted = int(insert_result.split()[-1]) if insert_result else 0
			updated = int(update_result.split()[-1]) if update_result else 0
		return inserted + updated

	# --- Invite & permissions operations ------------------------------------

	async def create_group_invite(
		self,
		*,
		group_id: UUID,
		invited_user_id: UUID,
		invited_by: UUID,
		role: str,
		expires_at: datetime | None,
	) -> models.GroupInvite:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				INSERT INTO group_invite (group_id, invited_user_id, invited_by, role, expires_at)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING *
				""",
				str(group_id),
				str(invited_user_id),
				str(invited_by),
				role,
				expires_at,
			)
		return models.GroupInvite.model_validate(dict(record))

	async def list_group_invites(self, group_id: UUID) -> list[models.GroupInvite]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM group_invite
				WHERE group_id=$1
				ORDER BY created_at DESC
				""",
				str(group_id),
			)
		return [models.GroupInvite.model_validate(dict(row)) for row in rows]

	async def accept_group_invite(
		self,
		invite_id: UUID,
		*,
		subject_user: UUID,
	) -> models.GroupInvite:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				record = await conn.fetchrow(
					"""
					UPDATE group_invite
					SET accepted_at = NOW()
					WHERE id=$1 AND invited_user_id=$2 AND accepted_at IS NULL
					RETURNING *
					""",
					str(invite_id),
					str(subject_user),
				)
				if record is None:
					raise NotFoundError("invite_not_found")
				await conn.execute(
					"""
					INSERT INTO group_member (group_id, user_id, role)
					VALUES ($1, $2, $3)
					ON CONFLICT (group_id, user_id)
					DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
					""",
					record["group_id"],
					record["invited_user_id"],
					record["role"],
				)
		return models.GroupInvite.model_validate(dict(record))

	async def discard_expired_invites(self, *, now: datetime) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			result = await conn.execute(
				"""
				DELETE FROM group_invite
				WHERE expires_at IS NOT NULL AND expires_at < $1 AND accepted_at IS NULL
				""",
				now,
			)
		return int(result.split()[-1]) if result else 0

	async def create_join_request(
		self,
		*,
		group_id: UUID,
		user_id: UUID,
		message: str | None,
	) -> models.GroupJoinRequest:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				INSERT INTO group_join_request (group_id, user_id, status, created_at)
				VALUES ($1, $2, 'pending', NOW())
				RETURNING *
				""",
				str(group_id),
				str(user_id),
			)
		return models.GroupJoinRequest.model_validate(dict(record))

	async def list_join_requests(
		self,
		group_id: UUID,
		*,
		status: str | None = None,
	) -> list[models.GroupJoinRequest]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			if status:
				rows = await conn.fetch(
					"""
					SELECT * FROM group_join_request
					WHERE group_id=$1 AND status=$2
					ORDER BY created_at DESC
					""",
					str(group_id),
					status,
				)
			else:
				rows = await conn.fetch(
					"""
					SELECT * FROM group_join_request
					WHERE group_id=$1
					ORDER BY created_at DESC
					""",
					str(group_id),
				)
		return [models.GroupJoinRequest.model_validate(dict(row)) for row in rows]

	async def review_join_request(
		self,
		request_id: UUID,
		*,
		actor_id: UUID,
		status: str,
	) -> models.GroupJoinRequest:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				UPDATE group_join_request
				SET status=$3, reviewed_by=$2, reviewed_at=NOW()
				WHERE id=$1
				RETURNING *
				""",
				str(request_id),
				str(actor_id),
				status,
			)
			if record is None:
				raise NotFoundError("join_request_not_found")
		return models.GroupJoinRequest.model_validate(dict(record))

	async def list_banned_or_muted_members(self, group_id: UUID) -> list[models.GroupMember]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM group_member
				WHERE group_id=$1 AND (is_banned = TRUE OR muted_until IS NOT NULL)
				ORDER BY updated_at DESC
				""",
				str(group_id),
			)
		return [models.GroupMember.model_validate(dict(row)) for row in rows]

	async def clear_expired_mutes(self) -> int:
		pool = await get_pool()
		async with pool.acquire() as conn:
			result = await conn.execute(
				"""
				UPDATE group_member
				SET muted_until = NULL, updated_at = NOW()
				WHERE muted_until IS NOT NULL AND muted_until < NOW()
				""",
			)
		return int(result.split()[-1]) if result else 0

	async def record_audit_event(
		self,
		*,
		group_id: UUID,
		user_id: UUID,
		action: str,
		details: dict | None = None,
	) -> models.GroupAuditEvent:
		pool = await get_pool()
		async with pool.acquire() as conn:
			record = await conn.fetchrow(
				"""
				INSERT INTO group_audit (group_id, user_id, action, details)
				VALUES ($1, $2, $3, $4::jsonb)
				RETURNING *
				""",
				str(group_id),
				str(user_id),
				action,
				json.dumps(details) if details else None,
			)
		return models.GroupAuditEvent.model_validate(dict(record))

	async def list_audit_events(
		self,
		group_id: UUID,
		*,
		limit: int = 50,
	) -> list[models.GroupAuditEvent]:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT * FROM group_audit
				WHERE group_id=$1
				ORDER BY created_at DESC
				LIMIT $2
				""",
				str(group_id),
				limit,
			)
		return [models.GroupAuditEvent.model_validate(dict(row)) for row in rows]
