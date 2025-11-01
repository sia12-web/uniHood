"""PostgreSQL implementation of the safety repository."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

import asyncpg

from app.moderation.domain.safety_repository import (
    AttachmentSafetyRecord,
    MediaHashEntry,
    MediaHashUpsert,
    SafetyRepository,
    TextScanRecord,
    UrlScanRecord,
)


class PostgresSafetyRepository(SafetyRepository):
    """Asyncpg-backed repository for moderation safety data."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def get_attachment_by_key(self, s3_key: str) -> AttachmentSafetyRecord | None:
        query = """
        SELECT id, subject_type, subject_id, s3_key, mime, size_bytes, safety_status, safety_score, scanned_at,
               created_at, created_by
        FROM media_attachment
        WHERE s3_key = $1
        LIMIT 1
        """
        record = await self.pool.fetchrow(query, s3_key)
        return _attachment_from_record(record) if record else None

    async def get_attachment(self, attachment_id: str) -> AttachmentSafetyRecord | None:
        query = """
        SELECT id, subject_type, subject_id, s3_key, mime, size_bytes, safety_status, safety_score, scanned_at,
               created_at, created_by
        FROM media_attachment
        WHERE id = $1
        """
        record = await self.pool.fetchrow(query, attachment_id)
        return _attachment_from_record(record) if record else None

    async def update_attachment_safety(
        self,
        attachment_id: str,
        *,
        safety_status: str,
        safety_score: Mapping[str, Any],
        scanned_at: datetime | None,
    ) -> None:
        query = """
        UPDATE media_attachment
        SET safety_status = $2,
            safety_score = $3::jsonb,
            scanned_at = $4
        WHERE id = $1
        """
        await self.pool.execute(query, attachment_id, safety_status, dict(safety_score), scanned_at)

    async def find_media_hash(self, algo: str, hash_value: str) -> MediaHashEntry | None:
        query = """
        SELECT id, algo, hash, label, source, created_at
        FROM mod_media_hash
        WHERE algo = $1 AND hash = $2
        """
        record = await self.pool.fetchrow(query, algo, hash_value)
        return _hash_from_record(record) if record else None

    async def bulk_upsert_media_hashes(self, entries: Sequence[MediaHashUpsert]) -> int:
        if not entries:
            return 0
        query = """
        INSERT INTO mod_media_hash (algo, hash, label, source)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (algo, hash)
        DO UPDATE SET label = EXCLUDED.label, source = EXCLUDED.source
        """
        await self.pool.executemany(
            query,
            [(entry.algo, entry.hash_value, entry.label, entry.source) for entry in entries],
        )
        return len(entries)

    async def upsert_text_scan(
        self,
        *,
        subject_type: str,
        subject_id: str,
        lang: str | None,
        scores: Mapping[str, float],
        ocr: bool,
    ) -> TextScanRecord:
        query = """
        INSERT INTO mod_text_scan (subject_type, subject_id, lang, scores, ocr)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (subject_type, subject_id)
        DO UPDATE SET lang = EXCLUDED.lang,
                      scores = EXCLUDED.scores,
                      ocr = EXCLUDED.ocr,
                      created_at = now()
        RETURNING id, subject_type, subject_id, lang, scores, ocr, created_at
        """
        record = await self.pool.fetchrow(query, subject_type, subject_id, lang, dict(scores), ocr)
        assert record is not None
        return _text_scan_from_record(record)

    async def get_recent_url_scan(self, final_url: str) -> UrlScanRecord | None:
        query = """
        SELECT id, url, final_url, eTLD_plus_one, verdict, details, created_at
        FROM mod_url_scan
        WHERE final_url = $1 OR url = $1
        ORDER BY created_at DESC
        LIMIT 1
        """
        record = await self.pool.fetchrow(query, final_url)
        return _url_scan_from_record(record) if record else None

    async def upsert_url_scan(
        self,
        *,
        url: str,
        final_url: str | None,
        etld_plus_one: str | None,
        verdict: str,
        details: Mapping[str, Any],
    ) -> UrlScanRecord:
        query = """
        INSERT INTO mod_url_scan (url, final_url, eTLD_plus_one, verdict, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (final_url)
        DO UPDATE SET url = EXCLUDED.url,
                      eTLD_plus_one = EXCLUDED.eTLD_plus_one,
                      verdict = EXCLUDED.verdict,
                      details = EXCLUDED.details,
                      created_at = now()
        RETURNING id, url, final_url, eTLD_plus_one, verdict, details, created_at
        """
        record = await self.pool.fetchrow(query, url, final_url, etld_plus_one, verdict, dict(details))
        assert record is not None
        return _url_scan_from_record(record)

    async def list_quarantine_items(
        self,
        *,
        status: str,
        after: datetime | None,
        limit: int,
    ) -> Sequence[AttachmentSafetyRecord]:
        query = """
        SELECT id, subject_type, subject_id, s3_key, mime, size_bytes, safety_status, safety_score, scanned_at,
               created_at, created_by
        FROM media_attachment
        WHERE safety_status = $1
          AND ($2::timestamptz IS NULL OR created_at > $2)
        ORDER BY created_at DESC
        LIMIT $3
        """
        records = await self.pool.fetch(query, status, after, limit)
        return [_attachment_from_record(record) for record in records]

    async def resolve_quarantine(
        self,
        attachment_id: str,
        *,
        verdict: str,
        note: str | None,
        actor_id: str | None,
    ) -> AttachmentSafetyRecord | None:
        query = """
        UPDATE media_attachment
        SET safety_status = $2,
            safety_score = COALESCE(safety_score, '{}'::jsonb) || jsonb_build_object(
                'moderator_verdict', $3,
                'moderator_note', $4,
                'moderator_actor', $5,
                'moderator_at', now()
            )
        WHERE id = $1
        RETURNING id, subject_type, subject_id, s3_key, mime, size_bytes, safety_status, safety_score, scanned_at,
                  created_at, created_by
        """
        record = await self.pool.fetchrow(query, attachment_id, verdict, verdict, note, actor_id)
        return _attachment_from_record(record) if record else None

    async def count_by_status(self, status: str) -> int:
        query = "SELECT COUNT(*) FROM media_attachment WHERE safety_status = $1"
        value = await self.pool.fetchval(query, status)
        return int(value or 0)


def _attachment_from_record(record: asyncpg.Record | None) -> AttachmentSafetyRecord | None:
    if record is None:
        return None
    score = record["safety_score"]
    if isinstance(score, str):
        try:
            import json

            score_dict = json.loads(score)
        except Exception:  # pragma: no cover - defensive fallback
            score_dict = {}
    else:
        score_dict = dict(score or {})
    return AttachmentSafetyRecord(
        attachment_id=str(record["id"]),
        subject_type=str(record["subject_type"]),
        subject_id=str(record["subject_id"]),
        s3_key=str(record["s3_key"]),
        mime=str(record["mime"]) if record["mime"] is not None else None,
        size_bytes=int(record["size_bytes"]) if record["size_bytes"] is not None else None,
        safety_status=str(record["safety_status"]),
        safety_score=score_dict,
        scanned_at=record["scanned_at"],
        created_at=record["created_at"],
        created_by=str(record["created_by"]) if record["created_by"] is not None else None,
    )


def _hash_from_record(record: asyncpg.Record | None) -> MediaHashEntry | None:
    if record is None:
        return None
    return MediaHashEntry(
        entry_id=int(record["id"]),
        algo=str(record["algo"]),
        hash_value=str(record["hash"]),
        label=str(record["label"]),
        source=str(record["source"]),
        created_at=record["created_at"],
    )


def _text_scan_from_record(record: asyncpg.Record) -> TextScanRecord:
    scores = record["scores"]
    if isinstance(scores, str):
        try:
            import json

            scores_map = json.loads(scores)
        except Exception:  # pragma: no cover
            scores_map = {}
    else:
        scores_map = dict(scores or {})
    return TextScanRecord(
        record_id=int(record["id"]),
        subject_type=str(record["subject_type"]),
        subject_id=str(record["subject_id"]),
        lang=str(record["lang"]) if record["lang"] is not None else None,
        scores=scores_map,
        ocr=bool(record["ocr"]),
        created_at=record["created_at"],
    )


def _url_scan_from_record(record: asyncpg.Record | None) -> UrlScanRecord | None:
    if record is None:
        return None
    details = record["details"]
    if isinstance(details, str):
        try:
            import json

            details_map = json.loads(details)
        except Exception:  # pragma: no cover
            details_map = {}
    else:
        details_map = dict(details or {})
    created_at = record["created_at"] or datetime.now(timezone.utc)
    return UrlScanRecord(
        record_id=int(record["id"]),
        url=str(record["url"]),
        final_url=str(record["final_url"]) if record["final_url"] is not None else None,
        etld_plus_one=str(record["etld_plus_one"]) if record["etld_plus_one"] is not None else None,
        verdict=str(record["verdict"]),
        details=details_map,
        created_at=created_at,
    )
