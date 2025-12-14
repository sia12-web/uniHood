"""
Configuration management for Docker Log Monitor.
"""
import os
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class EmailConfig:
    """Email notification configuration."""
    enabled: bool = False
    smtp_host: str = "mailhog"  # MailHog in dev
    smtp_port: int = 1025
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = False
    from_address: str = "alerts@unihood.local"
    to_addresses: List[str] = field(default_factory=list)
    subject_prefix: str = "[uniHood Alert]"


@dataclass
class AlertConfig:
    """Alert destination configuration."""
    slack_webhook: Optional[str] = None
    generic_webhook: Optional[str] = None
    console_only: bool = True  # Always print to console
    
    # Email configuration
    email: EmailConfig = field(default_factory=EmailConfig)
    
    # Rate limiting
    debounce_seconds: int = 60  # Minimum time between duplicate alerts
    max_alerts_per_minute: int = 10


@dataclass
class PatternConfig:
    """Log pattern matching configuration."""
    # Patterns to match (case-insensitive by default)
    error_patterns: List[str] = field(default_factory=lambda: [
        r"ERROR",
        r"Exception",
        r"CRITICAL",
        r"FATAL",
        r"Traceback \(most recent call last\)",
        r"panic:",
        r"failed to",
        r"connection refused",
        r"timeout",
    ])
    
    warning_patterns: List[str] = field(default_factory=lambda: [
        r"WARNING",
        r"WARN",
        r"deprecated",
        r"retry",
    ])
    
    # Patterns to ignore (reduce noise)
    ignore_patterns: List[str] = field(default_factory=lambda: [
        r"HealthCheck",
        r"GET /health",
        r"GET /metrics",
    ])


@dataclass
class MetricsConfig:
    """Container metrics monitoring configuration."""
    enabled: bool = True
    cpu_threshold_percent: float = 80.0  # Alert if CPU exceeds this
    memory_threshold_percent: float = 85.0  # Alert if memory exceeds this
    poll_interval_seconds: int = 30


@dataclass
class MonitorConfig:
    """Main monitor configuration."""
    # Containers to monitor (empty = all running containers)
    container_names: List[str] = field(default_factory=list)
    container_name_prefix: Optional[str] = None  # e.g., "unihood-"
    
    # Exclude specific containers
    exclude_containers: List[str] = field(default_factory=lambda: [
        "log-monitor",  # Don't monitor ourselves
    ])
    
    # Log streaming
    tail_lines: int = 100  # Number of historical lines to process on start
    
    # Sub-configurations
    alerts: AlertConfig = field(default_factory=AlertConfig)
    patterns: PatternConfig = field(default_factory=PatternConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)


def load_config_from_env() -> MonitorConfig:
    """Load configuration from environment variables."""
    config = MonitorConfig()
    
    # Alert configuration
    config.alerts.slack_webhook = os.getenv("SLACK_WEBHOOK")
    config.alerts.generic_webhook = os.getenv("ALERT_WEBHOOK")
    config.alerts.console_only = os.getenv("CONSOLE_ONLY", "true").lower() == "true"
    config.alerts.debounce_seconds = int(os.getenv("DEBOUNCE_SECONDS", "60"))
    config.alerts.max_alerts_per_minute = int(os.getenv("MAX_ALERTS_PER_MINUTE", "10"))
    
    # Email configuration
    config.alerts.email.enabled = os.getenv("EMAIL_ENABLED", "false").lower() == "true"
    config.alerts.email.smtp_host = os.getenv("SMTP_HOST", "mailhog")
    config.alerts.email.smtp_port = int(os.getenv("SMTP_PORT", "1025"))
    config.alerts.email.smtp_user = os.getenv("SMTP_USER")
    config.alerts.email.smtp_password = os.getenv("SMTP_PASSWORD")
    config.alerts.email.smtp_use_tls = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
    config.alerts.email.from_address = os.getenv("EMAIL_FROM", "alerts@unihood.local")
    to_addresses = os.getenv("EMAIL_TO", "")
    if to_addresses:
        config.alerts.email.to_addresses = [e.strip() for e in to_addresses.split(",")]
    
    # Container filtering
    container_names = os.getenv("MONITOR_CONTAINERS", "")
    if container_names:
        config.container_names = [c.strip() for c in container_names.split(",")]
    
    config.container_name_prefix = os.getenv("CONTAINER_PREFIX", "unihood-")
    
    exclude = os.getenv("EXCLUDE_CONTAINERS", "log-monitor")
    config.exclude_containers = [c.strip() for c in exclude.split(",")]
    
    # Metrics configuration
    config.metrics.enabled = os.getenv("METRICS_ENABLED", "true").lower() == "true"
    config.metrics.cpu_threshold_percent = float(os.getenv("CPU_THRESHOLD", "80"))
    config.metrics.memory_threshold_percent = float(os.getenv("MEMORY_THRESHOLD", "85"))
    config.metrics.poll_interval_seconds = int(os.getenv("METRICS_POLL_INTERVAL", "30"))
    
    return config
