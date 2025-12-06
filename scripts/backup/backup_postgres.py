#!/usr/bin/env python3
"""
PostgreSQL Backup Script for Divan Platform

This script performs automated PostgreSQL backups with:
- Full base backups (pg_dump)
- Compression using gzip
- Upload to S3-compatible storage
- Local retention cleanup
- Backup verification
- Metrics emission

Usage:
    python backup_postgres.py [--full|--incremental]

Environment Variables:
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
    S3_BACKUP_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
    BACKUP_RETENTION_DAYS (default: 30)
"""

import gzip
import hashlib
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Optional imports - gracefully degrade if not available
try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False
    print("Warning: boto3 not installed. S3 upload disabled.", file=sys.stderr)


class BackupConfig:
    """Configuration from environment variables."""
    
    def __init__(self):
        self.pg_host = os.getenv("POSTGRES_HOST", "localhost")
        self.pg_port = os.getenv("POSTGRES_PORT", "5432")
        self.pg_user = os.getenv("POSTGRES_USER", "divan")
        self.pg_password = os.getenv("POSTGRES_PASSWORD", "")
        self.pg_database = os.getenv("POSTGRES_DB", "divan")
        
        self.s3_bucket = os.getenv("S3_BACKUP_BUCKET", "")
        self.s3_region = os.getenv("S3_REGION", "us-east-1")
        self.s3_prefix = os.getenv("S3_BACKUP_PREFIX", "backups/postgres")
        
        self.local_backup_dir = Path(os.getenv("BACKUP_DIR", "/backups/postgres"))
        self.retention_days = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
        
        self.environment = os.getenv("ENVIRONMENT", "development")


class PostgresBackup:
    """Handles PostgreSQL backup operations."""
    
    def __init__(self, config: BackupConfig):
        self.config = config
        self.timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        self.backup_filename = f"divan_backup_{self.timestamp}.sql.gz"
        self.local_path = self.config.local_backup_dir / self.backup_filename
        self.checksum: Optional[str] = None
        
    def ensure_directories(self) -> None:
        """Create backup directories if they don't exist."""
        self.config.local_backup_dir.mkdir(parents=True, exist_ok=True)
        print(f"Backup directory: {self.config.local_backup_dir}")
        
    def create_backup(self) -> bool:
        """Create compressed PostgreSQL dump."""
        print(f"Creating backup: {self.backup_filename}")
        
        env = os.environ.copy()
        env["PGPASSWORD"] = self.config.pg_password
        
        # pg_dump command
        pg_dump_cmd = [
            "pg_dump",
            "-h", self.config.pg_host,
            "-p", self.config.pg_port,
            "-U", self.config.pg_user,
            "-d", self.config.pg_database,
            "--format=plain",
            "--no-owner",
            "--no-acl",
            "--verbose",
        ]
        
        try:
            # Create compressed backup
            with gzip.open(self.local_path, "wt", encoding="utf-8") as gz_file:
                result = subprocess.run(
                    pg_dump_cmd,
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=True,
                )
                gz_file.write(result.stdout)
            
            # Calculate checksum
            self.checksum = self._calculate_checksum(self.local_path)
            
            # Get file size
            size_mb = self.local_path.stat().st_size / (1024 * 1024)
            print(f"Backup created: {size_mb:.2f} MB, checksum: {self.checksum[:16]}...")
            
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"pg_dump failed: {e.stderr}", file=sys.stderr)
            return False
        except Exception as e:
            print(f"Backup failed: {e}", file=sys.stderr)
            return False
    
    def _calculate_checksum(self, filepath: Path) -> str:
        """Calculate SHA256 checksum of file."""
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def verify_backup(self) -> bool:
        """Verify backup integrity by testing gzip decompression."""
        print("Verifying backup integrity...")
        
        try:
            with gzip.open(self.local_path, "rt", encoding="utf-8") as gz_file:
                # Read first few lines to verify SQL header
                lines = []
                for i, line in enumerate(gz_file):
                    lines.append(line)
                    if i >= 20:
                        break
                
                # Check for PostgreSQL dump markers
                content = "".join(lines)
                if "PostgreSQL database dump" not in content:
                    print("Warning: Backup may not be valid PostgreSQL dump", file=sys.stderr)
                    return False
                
            print("Backup verification passed")
            return True
            
        except Exception as e:
            print(f"Backup verification failed: {e}", file=sys.stderr)
            return False
    
    def upload_to_s3(self) -> bool:
        """Upload backup to S3-compatible storage."""
        if not HAS_BOTO3:
            print("S3 upload skipped: boto3 not available")
            return True
        
        if not self.config.s3_bucket:
            print("S3 upload skipped: S3_BACKUP_BUCKET not configured")
            return True
        
        print(f"Uploading to s3://{self.config.s3_bucket}/{self.config.s3_prefix}/...")
        
        try:
            s3_client = boto3.client(
                "s3",
                region_name=self.config.s3_region,
            )
            
            s3_key = f"{self.config.s3_prefix}/{self.backup_filename}"
            
            # Upload with server-side encryption
            s3_client.upload_file(
                str(self.local_path),
                self.config.s3_bucket,
                s3_key,
                ExtraArgs={
                    "ServerSideEncryption": "AES256",
                    "Metadata": {
                        "checksum-sha256": self.checksum or "",
                        "environment": self.config.environment,
                        "database": self.config.pg_database,
                    }
                }
            )
            
            # Also upload checksum file
            checksum_key = f"{self.config.s3_prefix}/{self.backup_filename}.sha256"
            s3_client.put_object(
                Bucket=self.config.s3_bucket,
                Key=checksum_key,
                Body=f"{self.checksum}  {self.backup_filename}\n",
                ServerSideEncryption="AES256",
            )
            
            print(f"Uploaded to S3: {s3_key}")
            return True
            
        except ClientError as e:
            print(f"S3 upload failed: {e}", file=sys.stderr)
            return False
    
    def cleanup_old_backups(self) -> None:
        """Remove local backups older than retention period."""
        print(f"Cleaning up backups older than {self.config.retention_days} days...")
        
        cutoff = datetime.utcnow() - timedelta(days=self.config.retention_days)
        removed = 0
        
        for backup_file in self.config.local_backup_dir.glob("divan_backup_*.sql.gz"):
            try:
                # Parse timestamp from filename
                parts = backup_file.stem.replace("divan_backup_", "").replace(".sql", "")
                file_date = datetime.strptime(parts, "%Y%m%d_%H%M%S")
                
                if file_date < cutoff:
                    backup_file.unlink()
                    # Also remove checksum file if exists
                    checksum_file = backup_file.with_suffix(".gz.sha256")
                    if checksum_file.exists():
                        checksum_file.unlink()
                    removed += 1
                    
            except (ValueError, OSError) as e:
                print(f"Error processing {backup_file}: {e}", file=sys.stderr)
        
        print(f"Removed {removed} old backup(s)")
    
    def write_manifest(self) -> None:
        """Write backup manifest with metadata."""
        manifest_path = self.config.local_backup_dir / "latest_backup.json"
        
        import json
        manifest = {
            "filename": self.backup_filename,
            "timestamp": self.timestamp,
            "checksum_sha256": self.checksum,
            "size_bytes": self.local_path.stat().st_size if self.local_path.exists() else 0,
            "database": self.config.pg_database,
            "environment": self.config.environment,
            "s3_bucket": self.config.s3_bucket or None,
            "s3_key": f"{self.config.s3_prefix}/{self.backup_filename}" if self.config.s3_bucket else None,
        }
        
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        
        print(f"Manifest written: {manifest_path}")


def main() -> int:
    """Main backup workflow."""
    print("=" * 60)
    print(f"Divan PostgreSQL Backup - {datetime.utcnow().isoformat()}Z")
    print("=" * 60)
    
    config = BackupConfig()
    backup = PostgresBackup(config)
    
    # Step 1: Ensure directories
    backup.ensure_directories()
    
    # Step 2: Create backup
    if not backup.create_backup():
        print("FAILED: Backup creation failed", file=sys.stderr)
        return 1
    
    # Step 3: Verify backup
    if not backup.verify_backup():
        print("FAILED: Backup verification failed", file=sys.stderr)
        return 1
    
    # Step 4: Upload to S3
    if not backup.upload_to_s3():
        print("WARNING: S3 upload failed, but local backup exists", file=sys.stderr)
        # Don't fail completely if S3 upload fails
    
    # Step 5: Cleanup old backups
    backup.cleanup_old_backups()
    
    # Step 6: Write manifest
    backup.write_manifest()
    
    print("=" * 60)
    print("Backup completed successfully")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
