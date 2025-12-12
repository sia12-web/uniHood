"""Local file upload endpoints for development."""

from __future__ import annotations

import os
import ulid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.domain.identity import schemas
from app.domain.identity.s3 import ALLOWED_MIME_TYPES, MAX_AVATAR_BYTES
from app.infra.auth import AuthenticatedUser, get_current_user
from app.settings import settings

router = APIRouter()

# Local upload directory - configurable via settings
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "app/uploads"))
AVATAR_SUBDIR = "avatars"
GALLERY_SUBDIR = "gallery"


def _ensure_upload_dir(subdir: str, user_id: str) -> Path:
    """Ensure upload directory exists and return the path."""
    path = UPLOAD_DIR / subdir / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_extension(content_type: str) -> str:
    """Get file extension from content type."""
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    return mapping.get(content_type.lower(), ".jpg")


@router.post("/upload/avatar", response_model=schemas.LocalUploadResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.LocalUploadResponse:
    """Direct file upload for avatars in development mode."""
    if not file.content_type or file.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
        )

    # Read file content
    content = await file.read()
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_AVATAR_BYTES // 1024 // 1024}MB",
        )

    # Generate unique filename
    file_id = ulid.new().str
    ext = _get_extension(file.content_type)
    filename = f"{file_id}{ext}"

    # Save file
    upload_path = _ensure_upload_dir(AVATAR_SUBDIR, auth_user.id)
    file_path = upload_path / filename
    file_path.write_bytes(content)

    # Generate key and URL
    key = f"{AVATAR_SUBDIR}/{auth_user.id}/{filename}"
    
    # Use API URL for serving (handled by static files or a separate endpoint)
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
    url = f"{base_url}/uploads/{key}"

    return schemas.LocalUploadResponse(key=key, url=url)


@router.post("/upload/gallery", response_model=schemas.LocalUploadResponse)
async def upload_gallery(
    file: UploadFile = File(...),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.LocalUploadResponse:
    """Direct file upload for gallery images in development mode."""
    if not file.content_type or file.content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
        )

    # Read file content
    content = await file.read()
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_AVATAR_BYTES // 1024 // 1024}MB",
        )

    # Generate unique filename
    file_id = ulid.new().str
    ext = _get_extension(file.content_type)
    filename = f"{file_id}{ext}"

    # Save file
    upload_path = _ensure_upload_dir(f"{AVATAR_SUBDIR}/{auth_user.id}/{GALLERY_SUBDIR}", "")
    file_path = upload_path / filename
    file_path.write_bytes(content)

    # Generate key and URL
    key = f"{AVATAR_SUBDIR}/{auth_user.id}/{GALLERY_SUBDIR}/{filename}"
    
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
    url = f"{base_url}/uploads/{key}"

    return schemas.LocalUploadResponse(key=key, url=url)
