"""Asynchronous worker that scans uploaded media for safety signals."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from app.moderation.domain.hashing import PerceptualHasher
from app.moderation.domain.nsfw_client import NsfwClassifier, NsfwScore
from app.moderation.domain.ocr_client import OcrClient
from app.moderation.domain.safety_repository import AttachmentSafetyRecord, MediaHashEntry, SafetyRepository
from app.moderation.domain.thresholds import ModerationThresholds, ThresholdDecision
from app.obs import metrics

logger = logging.getLogger(__name__)


class RedisStreams(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


class ObjectStorage(Protocol):
    async def fetch(self, key: str, *, max_bytes: int | None = None) -> bytes:
        ...


@dataclass(slots=True)
class ImageScannerWorker:
    """Consumes media scan jobs, enriches metadata and emits policy signals."""

    redis: RedisStreams
    repository: SafetyRepository
    storage: ObjectStorage
    hasher: PerceptualHasher
    nsfw: NsfwClassifier
    ocr: OcrClient
    thresholds: ModerationThresholds
    ingress_stream: str = "scan:ingress"
    results_stream: str = "scan:results"
    quarantine_stream: str = "scan:quarantine"
    batch_size: int = 50
    block_ms: int = 5000
    last_id: str = "0-0"
    max_fetch_bytes: int = 25 * 1024 * 1024

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.ingress_stream: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode(payload)
                if event.get("type") not in {"image", "file"}:
                    continue
                await self._process_event(entry_id, event)
            self.last_id = entries[-1][0]

    async def _process_event(self, entry_id: str, event: Mapping[str, Any]) -> None:
        start = time.perf_counter()
        status = "error"
        try:
            attachment = await self._resolve_attachment(event)
            if not attachment:
                logger.warning("media scan skipped; attachment missing for s3_key=%s", event.get("s3_key"))
                return
            payload = await self.storage.fetch(attachment.s3_key, max_bytes=self.max_fetch_bytes)
            nsfw_scores = await self.nsfw.score(payload, mime=attachment.mime)
            perceptual_hash = self.hasher.compute(payload)
            hash_match = await self.repository.find_media_hash(perceptual_hash.algo, perceptual_hash.value)
            ocr_text = await self._extract_ocr(payload, attachment.mime)
            decision = self.thresholds.evaluate_image(
                nsfw_score=nsfw_scores.nsfw,
                gore_score=nsfw_scores.gore,
                hash_label=hash_match.label if hash_match else None,
                surface=event.get("surface"),
            )
            status = decision.status
            await self._persist_attachment(attachment, decision, perceptual_hash.value, nsfw_scores, ocr_text)
            await self._emit_results(entry_id, event, attachment, decision, nsfw_scores, perceptual_hash.value, hash_match, ocr_text)
        except Exception as exc:  # pragma: no cover - defensive guard, tested via integration
            status = "error"
            metrics.SCAN_FAILURES_TOTAL.labels("image", exc.__class__.__name__).inc()
            logger.exception("image scan failed: entry_id=%s", entry_id)
        finally:
            duration = time.perf_counter() - start
            metrics.SCAN_LATENCY_SECONDS.labels("image").observe(duration)
            metrics.SCAN_JOBS_TOTAL.labels("image", status).inc()

    async def _resolve_attachment(self, event: Mapping[str, Any]) -> AttachmentSafetyRecord | None:
        s3_key = str(event.get("s3_key")) if event.get("s3_key") else None
        attachment_id = str(event.get("attachment_id")) if event.get("attachment_id") else None
        attachment: AttachmentSafetyRecord | None = None
        if attachment_id:
            attachment = await self.repository.get_attachment(attachment_id)
        if not attachment and s3_key:
            attachment = await self.repository.get_attachment_by_key(s3_key)
        return attachment

    async def _extract_ocr(self, payload: bytes, mime: str | None) -> str:
        try:
            text = await self.ocr.extract_text(payload, mime=mime)
        except Exception:  # pragma: no cover - OCR failure tolerated
            logger.warning("OCR extraction failed", exc_info=True)
            return ""
        return text[:5000]

    async def _persist_attachment(
        self,
        attachment: AttachmentSafetyRecord,
        decision: ThresholdDecision,
        hash_value: str,
        nsfw_scores: NsfwScore,
        ocr_text: str,
    ) -> None:
        safety_score = dict(attachment.safety_score)
        safety_score.update(
            {
                "nsfw_score": nsfw_scores.nsfw,
                "gore_score": nsfw_scores.gore,
                "hash": hash_value,
                "ocr_excerpt": ocr_text[:200],
                "decision_level": decision.level,
            }
        )
        await self.repository.update_attachment_safety(
            attachment.attachment_id,
            safety_status=decision.status,
            safety_score=safety_score,
            scanned_at=datetime.now(timezone.utc),
        )

    async def _emit_results(
        self,
        entry_id: str,
        event: Mapping[str, Any],
        attachment: AttachmentSafetyRecord,
    decision: ThresholdDecision,
        nsfw_scores: NsfwScore,
        hash_value: str,
        hash_match: MediaHashEntry | None,
        ocr_text: str,
    ) -> None:
        metrics.NSFW_SCORE_HISTOGRAM.observe(nsfw_scores.nsfw)
        signals: dict[str, Any] = {
            "nsfw_score": nsfw_scores.nsfw,
            "gore_score": nsfw_scores.gore,
            "nsfw_level": decision.level,
            "hash_value": hash_value,
            "hash_label": hash_match.label if hash_match else None,
            "type": "image",
            "status": decision.status,
        }
        payload = {
            "event_id": entry_id,
            "subject_type": attachment.subject_type,
            "subject_id": attachment.subject_id,
            "attachment_id": attachment.attachment_id,
            "signals": json.dumps(signals),
            "suggested_action": decision.suggested_action,
            "source": "image",
            "status": decision.status,
        }
        await self.redis.xadd(self.results_stream, payload)
        if decision.status in {"needs_review", "quarantined"}:
            queue_payload = {
                "attachment_id": attachment.attachment_id,
                "subject_type": attachment.subject_type,
                "subject_id": attachment.subject_id,
                "status": decision.status,
                "reason": ";".join(decision.reasons),
            }
            await self.redis.xadd(self.quarantine_stream, queue_payload)
        if ocr_text:
            text_payload = {
                "event_id": entry_id,
                "subject_type": attachment.subject_type,
                "subject_id": attachment.subject_id,
                "type": "text",
                "ocr": "1",
                "text": ocr_text,
            }
            await self.redis.xadd(self.ingress_stream, text_payload)


def _decode(payload: Mapping[bytes, bytes]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}
    for key, value in payload.items():
        decoded_key = key.decode("utf-8") if isinstance(key, bytes) else str(key)
        decoded_value = value.decode("utf-8") if isinstance(value, bytes) else value
        decoded[decoded_key] = decoded_value
    return decoded
