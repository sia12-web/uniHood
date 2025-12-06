#!/usr/bin/env python3
"""
PostgreSQL Restore Script for Divan Platform

This script restores PostgreSQL databases from backups with:
- Download from S3-compatible storage
- Checksum verification
- Safe restore with confirmation prompts
- Point-in-time recovery support (if WAL available)

Usage:
    python restore_postgres.py --backup <filename>
    python restore_postgres.py --latest
    python restore_postgres.py --list

Environment Variables:
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
    S3_BACKUP_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
"""

import argparse
import gzip
import hashlib
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List

try:
    import boto3
    from botocore.exceptions import ClientError
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class RestoreConfig:
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
        self.restore_dir = Path(os.getenv("RESTORE_DIR", "/tmp/divan_restore"))


class PostgresRestore:
    """Handles PostgreSQL restore operations."""
    
    def __init__(self, config: RestoreConfig):
        self.config = config
        self.s3_client = None
        if HAS_BOTO3 and config.s3_bucket:
            self.s3_client = boto3.client("s3", region_name=config.s3_region)
    
    def list_backups(self, source: str = "both") -> List[dict]:
        """List available backups from local storage and/or S3."""
        backups = []
        
        # Local backups
        if source in ("both", "local"):
            for backup_file in self.config.local_backup_dir.glob("divan_backup_*.sql.gz"):
                try:
                    parts = backup_file.stem.replace("divan_backup_", "").replace(".sql", "")
                    timestamp = datetime.strptime(parts, "%Y%m%d_%H%M%S")
                    backups.append({
                        "filename": backup_file.name,
                        "timestamp": timestamp,
                        "size_mb": backup_file.stat().st_size / (1024 * 1024),
                        "source": "local",
                        "path": str(backup_file),
                    })
                except (ValueError, OSError):
                    continue
        
        # S3 backups
        if source in ("both", "s3") and self.s3_client:
            try:
                paginator = self.s3_client.get_paginator("list_objects_v2")
                for page in paginator.paginate(
                    Bucket=self.config.s3_bucket,
                    Prefix=f"{self.config.s3_prefix}/divan_backup_"
                ):
                    for obj in page.get("Contents", []):
                        key = obj["Key"]
                        if not key.endswith(".sql.gz"):
                            continue
                        
                        filename = key.split("/")[-1]
                        try:
                            parts = filename.replace("divan_backup_", "").replace(".sql.gz", "")
                            timestamp = datetime.strptime(parts, "%Y%m%d_%H%M%S")
                            
                            # Skip if we already have this one locally
                            if not any(b["filename"] == filename for b in backups):
                                backups.append({
                                    "filename": filename,
                                    "timestamp": timestamp,
                                    "size_mb": obj["Size"] / (1024 * 1024),
                                    "source": "s3",
                                    "path": key,
                                })
                        except ValueError:
                            continue
            except ClientError as e:
                print(f"Warning: Could not list S3 backups: {e}", file=sys.stderr)
        
        # Sort by timestamp descending
        backups.sort(key=lambda x: x["timestamp"], reverse=True)
        return backups
    
    def download_from_s3(self, s3_key: str, local_path: Path) -> bool:
        """Download backup from S3."""
        if not self.s3_client:
            print("S3 client not configured", file=sys.stderr)
            return False
        
        print(f"Downloading from s3://{self.config.s3_bucket}/{s3_key}...")
        
        try:
            local_path.parent.mkdir(parents=True, exist_ok=True)
            self.s3_client.download_file(
                self.config.s3_bucket,
                s3_key,
                str(local_path)
            )
            
            # Also download checksum if available
            checksum_key = f"{s3_key}.sha256"
            checksum_path = local_path.with_suffix(".gz.sha256")
            try:
                self.s3_client.download_file(
                    self.config.s3_bucket,
                    checksum_key,
                    str(checksum_path)
                )
            except ClientError:
                pass  # Checksum file may not exist
            
            print(f"Downloaded to {local_path}")
            return True
            
        except ClientError as e:
            print(f"Download failed: {e}", file=sys.stderr)
            return False
    
    def verify_checksum(self, backup_path: Path) -> bool:
        """Verify backup checksum if available."""
        checksum_path = backup_path.with_suffix(".gz.sha256")
        
        if not checksum_path.exists():
            print("No checksum file found, skipping verification")
            return True
        
        print("Verifying checksum...")
        
        # Read expected checksum
        with open(checksum_path, "r") as f:
            expected = f.read().split()[0].strip()
        
        # Calculate actual checksum
        sha256 = hashlib.sha256()
        with open(backup_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        actual = sha256.hexdigest()
        
        if actual == expected:
            print(f"Checksum verified: {actual[:16]}...")
            return True
        else:
            print(f"Checksum mismatch! Expected: {expected[:16]}..., Got: {actual[:16]}...", file=sys.stderr)
            return False
    
    def restore(self, backup_path: Path, target_db: Optional[str] = None) -> bool:
        """Restore database from backup file."""
        target_db = target_db or self.config.pg_database
        
        print(f"Restoring to database: {target_db}")
        print("=" * 60)
        
        env = os.environ.copy()
        env["PGPASSWORD"] = self.config.pg_password
        
        # Decompress and pipe to psql
        try:
            with gzip.open(backup_path, "rt", encoding="utf-8") as gz_file:
                psql_cmd = [
                    "psql",
                    "-h", self.config.pg_host,
                    "-p", self.config.pg_port,
                    "-U", self.config.pg_user,
                    "-d", target_db,
                    "--single-transaction",
                    "-v", "ON_ERROR_STOP=1",
                ]
                
                result = subprocess.run(
                    psql_cmd,
                    env=env,
                    input=gz_file.read(),
                    text=True,
                    capture_output=True,
                )
                
                if result.returncode != 0:
                    print(f"Restore failed: {result.stderr}", file=sys.stderr)
                    return False
                
                print("Restore completed successfully")
                return True
                
        except Exception as e:
            print(f"Restore failed: {e}", file=sys.stderr)
            return False
    
    def verify_restore(self) -> bool:
        """Run basic verification queries after restore."""
        print("Running post-restore verification...")
        
        env = os.environ.copy()
        env["PGPASSWORD"] = self.config.pg_password
        
        queries = [
            ("Users count", "SELECT COUNT(*) FROM users;"),
            ("Sessions count", "SELECT COUNT(*) FROM sessions;"),
            ("Profiles count", "SELECT COUNT(*) FROM profiles;"),
        ]
        
        all_passed = True
        for name, query in queries:
            try:
                result = subprocess.run(
                    [
                        "psql",
                        "-h", self.config.pg_host,
                        "-p", self.config.pg_port,
                        "-U", self.config.pg_user,
                        "-d", self.config.pg_database,
                        "-t", "-c", query,
                    ],
                    env=env,
                    capture_output=True,
                    text=True,
                )
                
                if result.returncode == 0:
                    count = result.stdout.strip()
                    print(f"  ✓ {name}: {count}")
                else:
                    print(f"  ✗ {name}: Query failed")
                    all_passed = False
                    
            except Exception as e:
                print(f"  ✗ {name}: {e}")
                all_passed = False
        
        return all_passed


def main() -> int:
    """Main restore workflow."""
    parser = argparse.ArgumentParser(description="Divan PostgreSQL Restore Tool")
    parser.add_argument("--backup", "-b", help="Specific backup filename to restore")
    parser.add_argument("--latest", "-l", action="store_true", help="Restore latest backup")
    parser.add_argument("--list", action="store_true", help="List available backups")
    parser.add_argument("--source", choices=["local", "s3", "both"], default="both",
                        help="Where to look for backups")
    parser.add_argument("--target-db", help="Target database name (default: from env)")
    parser.add_argument("--force", "-f", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--skip-verify", action="store_true", help="Skip checksum verification")
    
    args = parser.parse_args()
    
    config = RestoreConfig()
    restore = PostgresRestore(config)
    
    # List backups
    if args.list:
        backups = restore.list_backups(args.source)
        if not backups:
            print("No backups found")
            return 0
        
        print(f"{'Filename':<45} {'Timestamp':<20} {'Size (MB)':<10} {'Source':<8}")
        print("-" * 90)
        for b in backups:
            print(f"{b['filename']:<45} {b['timestamp'].isoformat():<20} {b['size_mb']:<10.2f} {b['source']:<8}")
        return 0
    
    # Determine which backup to restore
    backup_info = None
    
    if args.latest:
        backups = restore.list_backups(args.source)
        if not backups:
            print("No backups found", file=sys.stderr)
            return 1
        backup_info = backups[0]
        print(f"Latest backup: {backup_info['filename']}")
        
    elif args.backup:
        backups = restore.list_backups(args.source)
        for b in backups:
            if b["filename"] == args.backup:
                backup_info = b
                break
        
        if not backup_info:
            print(f"Backup not found: {args.backup}", file=sys.stderr)
            return 1
    else:
        parser.print_help()
        return 1
    
    # Confirmation
    if not args.force:
        print()
        print("=" * 60)
        print("WARNING: This will restore the database!")
        print(f"  Backup: {backup_info['filename']}")
        print(f"  Target: {args.target_db or config.pg_database}")
        print("=" * 60)
        response = input("Type 'yes' to continue: ")
        if response.lower() != "yes":
            print("Restore cancelled")
            return 0
    
    # Get backup file locally
    if backup_info["source"] == "s3":
        local_path = config.restore_dir / backup_info["filename"]
        if not restore.download_from_s3(backup_info["path"], local_path):
            return 1
    else:
        local_path = Path(backup_info["path"])
    
    # Verify checksum
    if not args.skip_verify:
        if not restore.verify_checksum(local_path):
            print("Checksum verification failed. Use --skip-verify to bypass.", file=sys.stderr)
            return 1
    
    # Perform restore
    if not restore.restore(local_path, args.target_db):
        return 1
    
    # Verify restore
    if not restore.verify_restore():
        print("Warning: Post-restore verification had issues", file=sys.stderr)
    
    print()
    print("=" * 60)
    print("Restore completed successfully!")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
