#!/usr/bin/env python3
"""
Master Backup Orchestrator for Divan Platform

This script runs all backup jobs in sequence:
1. PostgreSQL database backup
2. Redis backup
3. Media files backup

Usage:
    python run_all_backups.py [--postgres] [--redis] [--media] [--all]

Cron example (daily at 2 AM):
    0 2 * * * cd /app && python scripts/backup/run_all_backups.py --all >> /var/log/divan_backup.log 2>&1

Environment Variables:
    See individual backup scripts for required variables.
    SLACK_WEBHOOK_URL: Optional webhook for notifications
"""

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

# Optional: notifications
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class BackupOrchestrator:
    """Orchestrates all backup jobs."""
    
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.results: List[Tuple[str, bool, str]] = []
        self.slack_webhook = os.getenv("SLACK_WEBHOOK_URL", "")
    
    def run_backup(self, name: str, script: str) -> bool:
        """Run a backup script and capture result."""
        script_path = self.script_dir / script
        
        print()
        print("=" * 60)
        print(f"Running: {name}")
        print("=" * 60)
        
        if not script_path.exists():
            print(f"Script not found: {script_path}", file=sys.stderr)
            self.results.append((name, False, "Script not found"))
            return False
        
        try:
            result = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                timeout=3600,  # 1 hour timeout
            )
            
            print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            
            success = result.returncode == 0
            message = "Success" if success else f"Exit code: {result.returncode}"
            self.results.append((name, success, message))
            
            return success
            
        except subprocess.TimeoutExpired:
            self.results.append((name, False, "Timeout"))
            print(f"Timeout running {name}", file=sys.stderr)
            return False
            
        except Exception as e:
            self.results.append((name, False, str(e)))
            print(f"Error running {name}: {e}", file=sys.stderr)
            return False
    
    def run_postgres_backup(self) -> bool:
        """Run PostgreSQL backup."""
        return self.run_backup("PostgreSQL Backup", "backup_postgres.py")
    
    def run_redis_backup(self) -> bool:
        """Run Redis backup."""
        return self.run_backup("Redis Backup", "backup_redis.py")
    
    def run_media_backup(self) -> bool:
        """Run media files backup."""
        return self.run_backup("Media Backup", "backup_media.py")
    
    def run_all(self) -> bool:
        """Run all backups."""
        postgres_ok = self.run_postgres_backup()
        redis_ok = self.run_redis_backup()
        media_ok = self.run_media_backup()
        
        return postgres_ok and redis_ok and media_ok
    
    def print_summary(self) -> None:
        """Print summary of all backup results."""
        print()
        print("=" * 60)
        print("BACKUP SUMMARY")
        print("=" * 60)
        
        all_success = True
        for name, success, message in self.results:
            status = "✓" if success else "✗"
            print(f"  {status} {name}: {message}")
            if not success:
                all_success = False
        
        print("=" * 60)
        print(f"Overall: {'SUCCESS' if all_success else 'FAILED'}")
        print("=" * 60)
    
    def send_notification(self) -> None:
        """Send Slack notification with results."""
        if not self.slack_webhook or not HAS_REQUESTS:
            return
        
        all_success = all(r[1] for r in self.results)
        
        fields = []
        for name, success, message in self.results:
            fields.append({
                "title": name,
                "value": f"{'✓' if success else '✗'} {message}",
                "short": True,
            })
        
        payload = {
            "text": f"{'✅' if all_success else '❌'} Divan Backup {'Completed' if all_success else 'Failed'}",
            "attachments": [{
                "color": "good" if all_success else "danger",
                "fields": fields,
                "footer": f"Backup completed at {datetime.utcnow().isoformat()}Z",
            }]
        }
        
        try:
            requests.post(self.slack_webhook, json=payload, timeout=10)
        except Exception as e:
            print(f"Failed to send notification: {e}", file=sys.stderr)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Divan Backup Orchestrator")
    parser.add_argument("--postgres", action="store_true", help="Run PostgreSQL backup")
    parser.add_argument("--redis", action="store_true", help="Run Redis backup")
    parser.add_argument("--media", action="store_true", help="Run media backup")
    parser.add_argument("--all", action="store_true", help="Run all backups")
    parser.add_argument("--notify", action="store_true", help="Send Slack notification")
    
    args = parser.parse_args()
    
    # Default to --all if no specific backup selected
    if not any([args.postgres, args.redis, args.media, args.all]):
        args.all = True
    
    print("=" * 60)
    print(f"Divan Backup Orchestrator - {datetime.utcnow().isoformat()}Z")
    print("=" * 60)
    
    orchestrator = BackupOrchestrator()
    
    success = True
    
    if args.all:
        success = orchestrator.run_all()
    else:
        if args.postgres:
            success = orchestrator.run_postgres_backup() and success
        if args.redis:
            success = orchestrator.run_redis_backup() and success
        if args.media:
            success = orchestrator.run_media_backup() and success
    
    orchestrator.print_summary()
    
    if args.notify:
        orchestrator.send_notification()
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
