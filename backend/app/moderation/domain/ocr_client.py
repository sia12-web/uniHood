"""OCR adapters used by the media scanner."""

from __future__ import annotations

from typing import Protocol


class OcrClient(Protocol):
    """OCR interface that extracts text from binary image payloads."""

    async def extract_text(self, payload: bytes, *, mime: str | None = None) -> str:
        ...


class NoopOcrClient(OcrClient):
    """Fallback OCR client that returns an empty string."""

    async def extract_text(self, payload: bytes, *, mime: str | None = None) -> str:  # noqa: ARG002 - keep signature
        return ""
