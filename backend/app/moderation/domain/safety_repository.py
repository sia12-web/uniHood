"""Storage contracts and in-memory fallbacks for safety scanning data."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, MutableMapping, Protocol, Sequence


@dataclass(slots=True)
class AttachmentSafetyRecord:
    """Representation of a media attachment with moderation metadata."""

    attachment_id: str
    subject_type: str
    subject_id: str
    s3_key: str
    mime: str | None
    size_bytes: int | None
    safety_status: str
    safety_score: dict[str, Any]
    scanned_at: datetime | None
    created_at: datetime | None = None
    created_by: str | None = None


@dataclass(slots=True)
class MediaHashEntry:
    """Known-bad media hash entry."""

    entry_id: int
    algo: str
    hash_value: str
    label: str
    source: str
    created_at: datetime


@dataclass(slots=True)
class TextScanRecord:
    """Persisted text safety scores for a moderation subject."""

    record_id: int
    subject_type: str
    subject_id: str
    lang: str | None
    scores: dict[str, float]
    ocr: bool
    created_at: datetime


@dataclass(slots=True)
class UrlScanRecord:
    """Cached URL reputation decision."""

    record_id: int
    url: str
    final_url: str | None
    etld_plus_one: str | None
    verdict: str
    details: dict[str, Any]
    created_at: datetime


@dataclass(slots=True)
class MediaHashUpsert:
    """Input payload for bulk hash imports."""

    algo: str
    hash_value: str
    label: str
    source: str


class SafetyRepository(Protocol):
    """Abstract persistence layer for moderation safety scanning."""

    async def get_attachment_by_key(self, s3_key: str) -> AttachmentSafetyRecord | None:
        """Lookup an attachment slated for scanning via its storage key."""

    async def get_attachment(self, attachment_id: str) -> AttachmentSafetyRecord | None:
        """Fetch an attachment by identifier."""

    async def update_attachment_safety(
        self,
        attachment_id: str,
        *,
        safety_status: str,
        safety_score: Mapping[str, Any],
        scanned_at: datetime | None,
    ) -> None:
        """Persist the outcome of a scan."""

    async def find_media_hash(self, algo: str, hash_value: str) -> MediaHashEntry | None:
        """Return a known-bad media hash entry if one exists."""

    async def bulk_upsert_media_hashes(self, entries: Sequence[MediaHashUpsert]) -> int:
        """Insert or update multiple media hash records, returning the affected row count."""

    async def upsert_text_scan(
        self,
        *,
        subject_type: str,
        subject_id: str,
        lang: str | None,
        scores: Mapping[str, float],
        ocr: bool,
    ) -> TextScanRecord:
        """Upsert text scan scores for a subject and return the resulting record."""

    async def get_recent_url_scan(self, final_url: str) -> UrlScanRecord | None:
        """Fetch the cached verdict for a resolved URL."""

    async def upsert_url_scan(
        self,
        *,
        url: str,
        final_url: str | None,
        etld_plus_one: str | None,
        verdict: str,
        details: Mapping[str, Any],
    ) -> UrlScanRecord:
        """Persist a URL scan result."""

    async def list_quarantine_items(
        self,
        *,
        status: str,
        after: datetime | None,
        limit: int,
    ) -> Sequence[AttachmentSafetyRecord]:
        """Return attachments matching a quarantine status."""

    async def resolve_quarantine(
        self,
        attachment_id: str,
        *,
        verdict: str,
        note: str | None,
        actor_id: str | None,
    ) -> AttachmentSafetyRecord | None:
        """Apply a moderator verdict to an attachment and return the updated record."""

    async def count_by_status(self, status: str) -> int:
        """Return the current backlog size for the supplied status."""


@dataclass
class InMemorySafetyRepository(SafetyRepository):
    """Simple repository with in-memory state for local development and tests."""

    attachments: MutableMapping[str, AttachmentSafetyRecord] = field(default_factory=dict)
    hashes: MutableMapping[tuple[str, str], MediaHashEntry] = field(default_factory=dict)
    text_scans: MutableMapping[tuple[str, str], TextScanRecord] = field(default_factory=dict)
    url_scans: MutableMapping[str, UrlScanRecord] = field(default_factory=dict)

    async def get_attachment_by_key(self, s3_key: str) -> AttachmentSafetyRecord | None:
        for record in self.attachments.values():
            if record.s3_key == s3_key:
                return record
        return None

    async def get_attachment(self, attachment_id: str) -> AttachmentSafetyRecord | None:
        return self.attachments.get(attachment_id)

    async def update_attachment_safety(
        self,
        attachment_id: str,
        *,
        safety_status: str,
        safety_score: Mapping[str, Any],
        scanned_at: datetime | None,
    ) -> None:
        record = self.attachments.setdefault(
            attachment_id,
            AttachmentSafetyRecord(
                attachment_id=attachment_id,
                subject_type="unknown",
                subject_id="unknown",
                s3_key=attachment_id,
                mime=None,
                size_bytes=None,
                safety_status="pending",
                safety_score={},
                scanned_at=None,
                created_at=datetime.now(timezone.utc),
                created_by=None,
            ),
        )
        record.safety_status = safety_status
        record.safety_score = dict(safety_score)
        record.scanned_at = scanned_at

    async def find_media_hash(self, algo: str, hash_value: str) -> MediaHashEntry | None:
        return self.hashes.get((algo, hash_value))

    async def bulk_upsert_media_hashes(self, entries: Sequence[MediaHashUpsert]) -> int:
        count = 0
        for entry in entries:
            key = (entry.algo, entry.hash_value)
            existing = self.hashes.get(key)
            if existing is None:
                count += 1
                self.hashes[key] = MediaHashEntry(
                    entry_id=len(self.hashes) + 1,
                    algo=entry.algo,
                    hash_value=entry.hash_value,
                    label=entry.label,
                    source=entry.source,
                    created_at=datetime.now(timezone.utc),
                )
            else:
                if existing.label != entry.label or existing.source != entry.source:
                    self.hashes[key] = MediaHashEntry(
                        entry_id=existing.entry_id,
                        algo=entry.algo,
                        hash_value=entry.hash_value,
                        label=entry.label,
                        source=entry.source,
                        created_at=existing.created_at,
                    )
        return count

    async def upsert_text_scan(
        self,
        *,
        subject_type: str,
        subject_id: str,
        lang: str | None,
        scores: Mapping[str, float],
        ocr: bool,
    ) -> TextScanRecord:
        key = (subject_type, subject_id)
        record = TextScanRecord(
            record_id=len(self.text_scans) + 1,
            subject_type=subject_type,
            subject_id=subject_id,
            lang=lang,
            scores=dict(scores),
            ocr=ocr,
            created_at=datetime.now(timezone.utc),
        )
        self.text_scans[key] = record
        return record

    async def get_recent_url_scan(self, final_url: str) -> UrlScanRecord | None:
        return self.url_scans.get(final_url)

    async def upsert_url_scan(
        self,
        *,
        url: str,
        final_url: str | None,
        etld_plus_one: str | None,
        verdict: str,
        details: Mapping[str, Any],
    ) -> UrlScanRecord:
        key = final_url or url
        record = UrlScanRecord(
            record_id=len(self.url_scans) + 1,
            url=url,
            final_url=final_url,
            etld_plus_one=etld_plus_one,
            verdict=verdict,
            details=dict(details),
            created_at=datetime.now(timezone.utc),
        )
        self.url_scans[key] = record
        return record

    async def list_quarantine_items(
        self,
        *,
        status: str,
        after: datetime | None,
        limit: int,
    ) -> Sequence[AttachmentSafetyRecord]:
        items = [record for record in self.attachments.values() if record.safety_status == status]
        if after:
            items = [item for item in items if (item.created_at or datetime.min.replace(tzinfo=timezone.utc)) > after]
        return sorted(items, key=lambda item: item.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:limit]

    async def resolve_quarantine(
        self,
        attachment_id: str,
        *,
        verdict: str,
        note: str | None,
        actor_id: str | None,
    ) -> AttachmentSafetyRecord | None:
        record = self.attachments.get(attachment_id)
        if not record:
            return None
        record.safety_status = "clean" if verdict == "clean" else verdict
        score = dict(record.safety_score)
        score.update(
            {
                "moderator_verdict": verdict,
                "moderator_note": note,
                "moderator_actor": actor_id,
                "moderator_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        record.safety_score = score
        return record

    async def count_by_status(self, status: str) -> int:
        return sum(1 for record in self.attachments.values() if record.safety_status == status)
