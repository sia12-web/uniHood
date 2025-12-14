"""
Alert handlers for Docker Log Monitor.
Supports Slack, generic webhooks, email, and console output.
"""
import json
import smtplib
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, List, Optional

import requests

from config import AlertConfig, EmailConfig
from patterns import MatchResult, Severity


@dataclass
class Alert:
    """Represents an alert to be sent."""
    container: str
    severity: Severity
    message: str
    log_line: str
    timestamp: datetime
    pattern: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "container": self.container,
            "severity": self.severity.value,
            "message": self.message,
            "log_line": self.log_line,
            "timestamp": self.timestamp.isoformat(),
            "pattern": self.pattern,
        }


class AlertHandler(ABC):
    """Abstract base class for alert handlers."""
    
    @abstractmethod
    def send(self, alert: Alert) -> bool:
        """Send an alert. Returns True if successful."""
        pass
    
    @abstractmethod
    def name(self) -> str:
        """Handler name for logging."""
        pass


class ConsoleHandler(AlertHandler):
    """Print alerts to console."""
    
    SEVERITY_COLORS = {
        Severity.INFO: "\033[0m",      # Default
        Severity.WARNING: "\033[93m",  # Yellow
        Severity.ERROR: "\033[91m",    # Red
        Severity.CRITICAL: "\033[95m", # Magenta
    }
    RESET = "\033[0m"
    
    def send(self, alert: Alert) -> bool:
        color = self.SEVERITY_COLORS.get(alert.severity, self.RESET)
        icon = {
            Severity.INFO: "ℹ️",
            Severity.WARNING: "⚠️",
            Severity.ERROR: "❌",
            Severity.CRITICAL: "🚨",
        }.get(alert.severity, "📋")
        
        print(f"{color}{icon} [{alert.severity.value.upper()}] {alert.container}: {alert.message}{self.RESET}")
        print(f"   └─ {alert.log_line[:200]}{'...' if len(alert.log_line) > 200 else ''}")
        return True
    
    def name(self) -> str:
        return "Console"


class SlackHandler(AlertHandler):
    """Send alerts to Slack via webhook."""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, alert: Alert) -> bool:
        icon = {
            Severity.INFO: ":information_source:",
            Severity.WARNING: ":warning:",
            Severity.ERROR: ":x:",
            Severity.CRITICAL: ":rotating_light:",
        }.get(alert.severity, ":bell:")
        
        payload = {
            "text": f"{icon} *{alert.severity.value.upper()}* in `{alert.container}`",
            "attachments": [
                {
                    "color": {
                        Severity.INFO: "#36a64f",
                        Severity.WARNING: "#ffcc00",
                        Severity.ERROR: "#ff0000",
                        Severity.CRITICAL: "#8b0000",
                    }.get(alert.severity, "#808080"),
                    "fields": [
                        {"title": "Container", "value": alert.container, "short": True},
                        {"title": "Severity", "value": alert.severity.value, "short": True},
                        {"title": "Message", "value": alert.message, "short": False},
                        {"title": "Log Line", "value": f"```{alert.log_line[:500]}```", "short": False},
                    ],
                    "ts": int(alert.timestamp.timestamp()),
                }
            ]
        }
        
        try:
            response = requests.post(
                self.webhook_url,
                json=payload,
                timeout=10
            )
            return response.status_code == 200
        except requests.RequestException as e:
            print(f"Failed to send Slack alert: {e}")
            return False
    
    def name(self) -> str:
        return "Slack"


class WebhookHandler(AlertHandler):
    """Send alerts to a generic webhook endpoint."""
    
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
    
    def send(self, alert: Alert) -> bool:
        try:
            response = requests.post(
                self.webhook_url,
                json=alert.to_dict(),
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            return 200 <= response.status_code < 300
        except requests.RequestException as e:
            print(f"Failed to send webhook alert: {e}")
            return False
    
    def name(self) -> str:
        return "Webhook"


class EmailHandler(AlertHandler):
    """Send alerts via email (SMTP)."""
    
    def __init__(self, config: EmailConfig):
        self.config = config
    
    def _build_html_body(self, alert: Alert) -> str:
        """Build HTML email body."""
        color = {
            Severity.INFO: "#36a64f",
            Severity.WARNING: "#ffcc00",
            Severity.ERROR: "#ff0000",
            Severity.CRITICAL: "#8b0000",
        }.get(alert.severity, "#808080")
        
        return f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="border-left: 4px solid {color}; padding-left: 16px;">
                <h2 style="color: {color}; margin: 0;">
                    {alert.severity.value.upper()} Alert
                </h2>
                <p style="color: #666; margin: 8px 0;">
                    Container: <strong>{alert.container}</strong>
                </p>
            </div>
            
            <div style="margin-top: 20px;">
                <h3 style="margin: 0 0 8px 0;">Message</h3>
                <p style="margin: 0; padding: 12px; background: #f5f5f5; border-radius: 4px;">
                    {alert.message}
                </p>
            </div>
            
            <div style="margin-top: 20px;">
                <h3 style="margin: 0 0 8px 0;">Log Line</h3>
                <pre style="margin: 0; padding: 12px; background: #1e1e1e; color: #d4d4d4; 
                            border-radius: 4px; overflow-x: auto; font-size: 12px;">
{alert.log_line[:1000]}</pre>
            </div>
            
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                    Sent by uniHood Log Monitor at {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
                </p>
            </div>
        </body>
        </html>
        """
    
    def send(self, alert: Alert) -> bool:
        if not self.config.to_addresses:
            print("Email alert skipped: no recipients configured")
            return False
        
        try:
            # Create message
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"{self.config.subject_prefix} {alert.severity.value.upper()} in {alert.container}"
            msg["From"] = self.config.from_address
            msg["To"] = ", ".join(self.config.to_addresses)
            
            # Plain text version
            text_body = f"""
{alert.severity.value.upper()} Alert from {alert.container}

Message: {alert.message}

Log Line:
{alert.log_line[:500]}

Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}
            """
            
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(self._build_html_body(alert), "html"))
            
            # Send email
            if self.config.smtp_use_tls:
                server = smtplib.SMTP(self.config.smtp_host, self.config.smtp_port)
                server.starttls()
            else:
                server = smtplib.SMTP(self.config.smtp_host, self.config.smtp_port)
            
            if self.config.smtp_user and self.config.smtp_password:
                server.login(self.config.smtp_user, self.config.smtp_password)
            
            server.sendmail(
                self.config.from_address,
                self.config.to_addresses,
                msg.as_string()
            )
            server.quit()
            
            print(f"📧 Email alert sent to {len(self.config.to_addresses)} recipient(s)")
            return True
            
        except Exception as e:
            print(f"Failed to send email alert: {e}")
            return False
    
    def name(self) -> str:
        return "Email"


class AlertManager:
    """
    Manages alert routing, deduplication, and rate limiting.
    """
    
    def __init__(self, config: AlertConfig):
        self.config = config
        self.handlers: List[AlertHandler] = []
        
        # Rate limiting state
        self._last_alert_time: Dict[str, float] = defaultdict(float)
        self._alerts_this_minute: List[float] = []
        
        # Initialize handlers based on config
        if config.console_only or not (config.slack_webhook or config.generic_webhook):
            self.handlers.append(ConsoleHandler())
        
        if config.slack_webhook:
            self.handlers.append(SlackHandler(config.slack_webhook))
        
        if config.generic_webhook:
            self.handlers.append(WebhookHandler(config.generic_webhook))
        
        if config.email.enabled:
            self.handlers.append(EmailHandler(config.email))
    
    def _get_dedup_key(self, alert: Alert) -> str:
        """Generate a key for deduplication."""
        return f"{alert.container}:{alert.severity.value}:{alert.pattern or alert.message[:50]}"
    
    def _is_rate_limited(self) -> bool:
        """Check if we've exceeded the rate limit."""
        now = time.time()
        # Remove alerts older than 60 seconds
        self._alerts_this_minute = [t for t in self._alerts_this_minute if now - t < 60]
        return len(self._alerts_this_minute) >= self.config.max_alerts_per_minute
    
    def _is_duplicate(self, alert: Alert) -> bool:
        """Check if this alert was sent recently (debounce)."""
        key = self._get_dedup_key(alert)
        now = time.time()
        last_time = self._last_alert_time.get(key, 0)
        
        if now - last_time < self.config.debounce_seconds:
            return True
        
        self._last_alert_time[key] = now
        return False
    
    def send_alert(self, match_result: MatchResult, message: Optional[str] = None) -> bool:
        """
        Process and send an alert based on a match result.
        
        Returns True if alert was sent, False if skipped or failed.
        """
        if not match_result.matched:
            return False
        
        alert = Alert(
            container=match_result.container,
            severity=match_result.severity,
            message=message or f"Pattern matched: {match_result.pattern}",
            log_line=match_result.line,
            timestamp=datetime.now(),
            pattern=match_result.pattern,
        )
        
        # Check deduplication
        if self._is_duplicate(alert):
            return False
        
        # Check rate limiting
        if self._is_rate_limited():
            print(f"⏸️ Rate limit reached, skipping alert for {alert.container}")
            return False
        
        # Record this alert for rate limiting
        self._alerts_this_minute.append(time.time())
        
        # Send to all handlers
        success = False
        for handler in self.handlers:
            try:
                if handler.send(alert):
                    success = True
            except Exception as e:
                print(f"Handler {handler.name()} failed: {e}")
        
        return success
    
    def send_metrics_alert(
        self,
        container: str,
        metric_type: str,
        current_value: float,
        threshold: float
    ) -> bool:
        """Send an alert for metrics threshold breach."""
        alert = Alert(
            container=container,
            severity=Severity.WARNING,
            message=f"{metric_type} at {current_value:.1f}% (threshold: {threshold:.1f}%)",
            log_line=f"Resource usage spike detected",
            timestamp=datetime.now(),
        )
        
        if self._is_duplicate(alert):
            return False
        
        if self._is_rate_limited():
            return False
        
        self._alerts_this_minute.append(time.time())
        
        for handler in self.handlers:
            handler.send(alert)
        
        return True
