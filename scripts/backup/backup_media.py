#!/usr/bin/env python3
"""
Media/File Storage Backup Script for Divan Platform

This script backs up user-uploaded media files:
- Profile photos
- Chat attachments  
- Other user uploads

Usage:
    python backup_media.py

Environment Variables:
    UPLOADS_DIR: Local uploads directory (default: /data/uploads)
    S3_BACKUP_BUCKET: S3 bucket for backups
    S3_REGION: AWS region
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class MediaBackupConfig:
    """Configuration from environment."""
    
    def __init__(self):
        self.uploads_dir = Path(os.getenv("UPLOADS_DIR", "/data/uploads"))
        self.s3_bucket = os.getenv("S3_BACKUP_BUCKET", "")
        self.s3_region = os.getenv("S3_REGION", "us-east-1")
        self.s3_prefix = os.getenv("S3_MEDIA_PREFIX", "backups/media")


class MediaBackup:
    """Handles media file backup operations."""
    
    def __init__(self, config: MediaBackupConfig):
        self.config = config
        self.s3_client = None
        if HAS_BOTO3 and config.s3_bucket:
            self.s3_client = boto3.client("s3", region_name=config.s3_region)
        
        self.timestamp = datetime.utcnow().strftime("%Y%m%d")
        self.stats = {
            "total_files": 0,
            "uploaded_files": 0,
            "skipped_files": 0,
            "failed_files": 0,
            "total_bytes": 0,
        }
    
    def scan_files(self) -> List[Path]:
        """Scan uploads directory for files."""
        if not self.config.uploads_dir.exists():
            print(f"Uploads directory not found: {self.config.uploads_dir}")
            return []
        
        files = []
        for filepath in self.config.uploads_dir.rglob("*"):
            if filepath.is_file():
                files.append(filepath)
        
        self.stats["total_files"] = len(files)
        print(f"Found {len(files)} files to backup")
        return files
    
    def get_s3_key(self, local_path: Path) -> str:
        """Generate S3 key for a local file."""
        relative = local_path.relative_to(self.config.uploads_dir)
        return f"{self.config.s3_prefix}/{self.timestamp}/{relative}"
    
    def should_upload(self, local_path: Path, s3_key: str) -> bool:
        """Check if file should be uploaded (not already in S3 or changed)."""
        if not self.s3_client:
            return False
        
        try:
            response = self.s3_client.head_object(
                Bucket=self.config.s3_bucket,
                Key=s3_key,
            )
            
            # Compare sizes
            local_size = local_path.stat().st_size
            s3_size = response["ContentLength"]
            
            if local_size != s3_size:
                return True  # File changed
            
            return False  # Already exists with same size
            
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return True  # Doesn't exist in S3
            raise
    
    def upload_file(self, local_path: Path) -> bool:
        """Upload a single file to S3."""
        if not self.s3_client:
            return False
        
        s3_key = self.get_s3_key(local_path)
        
        try:
            # Check if upload needed
            if not self.should_upload(local_path, s3_key):
                self.stats["skipped_files"] += 1
                return True
            
            # Determine content type
            content_type = self._get_content_type(local_path)
            
            # Upload
            self.s3_client.upload_file(
                str(local_path),
                self.config.s3_bucket,
                s3_key,
                ExtraArgs={
                    "ServerSideEncryption": "AES256",
                    "ContentType": content_type,
                }
            )
            
            self.stats["uploaded_files"] += 1
            self.stats["total_bytes"] += local_path.stat().st_size
            return True
            
        except Exception as e:
            print(f"Failed to upload {local_path}: {e}", file=sys.stderr)
            self.stats["failed_files"] += 1
            return False
    
    def _get_content_type(self, path: Path) -> str:
        """Determine content type from file extension."""
        extension_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
            ".mp4": "video/mp4",
            ".webm": "video/webm",
        }
        return extension_map.get(path.suffix.lower(), "application/octet-stream")
    
    def backup_all(self) -> bool:
        """Backup all media files."""
        if not self.s3_client:
            print("S3 client not configured. Set S3_BACKUP_BUCKET.", file=sys.stderr)
            return False
        
        files = self.scan_files()
        if not files:
            print("No files to backup")
            return True
        
        print(f"Backing up to s3://{self.config.s3_bucket}/{self.config.s3_prefix}/{self.timestamp}/")
        
        for i, filepath in enumerate(files):
            if (i + 1) % 100 == 0:
                print(f"Progress: {i + 1}/{len(files)}")
            self.upload_file(filepath)
        
        return self.stats["failed_files"] == 0
    
    def print_summary(self) -> None:
        """Print backup summary."""
        print()
        print("=" * 60)
        print("Media Backup Summary")
        print("=" * 60)
        print(f"Total files:    {self.stats['total_files']}")
        print(f"Uploaded:       {self.stats['uploaded_files']}")
        print(f"Skipped:        {self.stats['skipped_files']}")
        print(f"Failed:         {self.stats['failed_files']}")
        print(f"Data uploaded:  {self.stats['total_bytes'] / (1024*1024):.2f} MB")
        print("=" * 60)


def main() -> int:
    """Main backup workflow."""
    print("=" * 60)
    print(f"Divan Media Backup - {datetime.utcnow().isoformat()}Z")
    print("=" * 60)
    
    config = MediaBackupConfig()
    backup = MediaBackup(config)
    
    success = backup.backup_all()
    backup.print_summary()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
