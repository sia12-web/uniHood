#!/usr/bin/env python3
"""
Redis Backup Script for Divan Platform

This script backs up Redis data:
- Triggers BGSAVE to create RDB snapshot
- Copies RDB file to backup location
- Uploads to S3

Usage:
    python backup_redis.py

Environment Variables:
    REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
    REDIS_DATA_DIR: Where Redis stores dump.rdb
    S3_BACKUP_BUCKET, S3_REGION
"""

import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import redis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class RedisBackupConfig:
    """Configuration from environment."""
    
    def __init__(self):
        self.redis_host = os.getenv("REDIS_HOST", "localhost")
        self.redis_port = int(os.getenv("REDIS_PORT", "6379"))
        self.redis_password = os.getenv("REDIS_PASSWORD", None)
        self.redis_data_dir = Path(os.getenv("REDIS_DATA_DIR", "/data/redis"))
        
        self.backup_dir = Path(os.getenv("BACKUP_DIR", "/backups/redis"))
        self.s3_bucket = os.getenv("S3_BACKUP_BUCKET", "")
        self.s3_region = os.getenv("S3_REGION", "us-east-1")
        self.s3_prefix = os.getenv("S3_REDIS_PREFIX", "backups/redis")


class RedisBackup:
    """Handles Redis backup operations."""
    
    def __init__(self, config: RedisBackupConfig):
        self.config = config
        self.timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        self.backup_filename = f"redis_dump_{self.timestamp}.rdb"
        
        self.redis_client = None
        if HAS_REDIS:
            self.redis_client = redis.Redis(
                host=config.redis_host,
                port=config.redis_port,
                password=config.redis_password,
                decode_responses=True,
            )
        
        self.s3_client = None
        if HAS_BOTO3 and config.s3_bucket:
            self.s3_client = boto3.client("s3", region_name=config.s3_region)
    
    def trigger_bgsave(self) -> bool:
        """Trigger Redis BGSAVE command."""
        if not self.redis_client:
            print("Redis client not available", file=sys.stderr)
            return False
        
        print("Triggering Redis BGSAVE...")
        
        try:
            # Get last save time before
            info = self.redis_client.info("persistence")
            last_save_before = info.get("rdb_last_save_time", 0)
            
            # Trigger BGSAVE
            self.redis_client.bgsave()
            
            # Wait for save to complete (max 60 seconds)
            for _ in range(60):
                time.sleep(1)
                info = self.redis_client.info("persistence")
                last_save_after = info.get("rdb_last_save_time", 0)
                
                if last_save_after > last_save_before:
                    print(f"BGSAVE completed at {datetime.fromtimestamp(last_save_after)}")
                    return True
            
            print("Warning: BGSAVE may not have completed", file=sys.stderr)
            return True  # Continue anyway
            
        except Exception as e:
            print(f"BGSAVE failed: {e}", file=sys.stderr)
            return False
    
    def copy_rdb_file(self) -> bool:
        """Copy RDB file to backup location."""
        source = self.config.redis_data_dir / "dump.rdb"
        
        if not source.exists():
            print(f"RDB file not found: {source}", file=sys.stderr)
            return False
        
        self.config.backup_dir.mkdir(parents=True, exist_ok=True)
        dest = self.config.backup_dir / self.backup_filename
        
        print(f"Copying {source} to {dest}")
        shutil.copy2(source, dest)
        
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"Backup created: {size_mb:.2f} MB")
        
        return True
    
    def upload_to_s3(self) -> bool:
        """Upload backup to S3."""
        if not self.s3_client:
            print("S3 upload skipped: not configured")
            return True
        
        local_path = self.config.backup_dir / self.backup_filename
        s3_key = f"{self.config.s3_prefix}/{self.backup_filename}"
        
        print(f"Uploading to s3://{self.config.s3_bucket}/{s3_key}")
        
        try:
            self.s3_client.upload_file(
                str(local_path),
                self.config.s3_bucket,
                s3_key,
                ExtraArgs={"ServerSideEncryption": "AES256"}
            )
            print("Upload completed")
            return True
            
        except Exception as e:
            print(f"Upload failed: {e}", file=sys.stderr)
            return False
    
    def cleanup_old_backups(self, retention_days: int = 7) -> None:
        """Remove old local backups."""
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        removed = 0
        
        for backup_file in self.config.backup_dir.glob("redis_dump_*.rdb"):
            try:
                parts = backup_file.stem.replace("redis_dump_", "")
                file_date = datetime.strptime(parts, "%Y%m%d_%H%M%S")
                
                if file_date < cutoff:
                    backup_file.unlink()
                    removed += 1
            except (ValueError, OSError):
                continue
        
        if removed:
            print(f"Removed {removed} old backup(s)")


def main() -> int:
    """Main backup workflow."""
    print("=" * 60)
    print(f"Divan Redis Backup - {datetime.utcnow().isoformat()}Z")
    print("=" * 60)
    
    config = RedisBackupConfig()
    backup = RedisBackup(config)
    
    # Step 1: Trigger BGSAVE
    if not backup.trigger_bgsave():
        print("Warning: BGSAVE failed, trying to copy existing dump", file=sys.stderr)
    
    # Step 2: Copy RDB file
    if not backup.copy_rdb_file():
        print("FAILED: Could not copy RDB file", file=sys.stderr)
        return 1
    
    # Step 3: Upload to S3
    backup.upload_to_s3()
    
    # Step 4: Cleanup
    backup.cleanup_old_backups()
    
    print("=" * 60)
    print("Redis backup completed")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
