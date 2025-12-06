"""
Privacy Controls for Backend Performance Monitoring

Implements:
- PII scrubbing from logs, traces, and metrics
- Sampling controls
- Data retention policies
"""

import re
import hashlib
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Pattern
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# ===== CONFIGURATION =====

@dataclass
class PrivacyConfig:
    """Privacy configuration for backend monitoring."""
    
    # Enable/disable all tracking
    enabled: bool = True
    
    # PII patterns to scrub
    pii_patterns: List[Pattern] = field(default_factory=list)
    
    # Fields to always redact in logs/traces
    sensitive_fields: List[str] = field(default_factory=list)
    
    # Headers to never log
    sensitive_headers: List[str] = field(default_factory=list)
    
    # Maximum payload size to log (bytes)
    max_payload_size: int = 1024
    
    # Anonymize user IDs in metrics
    anonymize_user_ids: bool = True
    
    # Hash salt for anonymization
    anonymization_salt: str = ""
    
    # Retention periods (hours)
    trace_retention_hours: int = 24
    metric_retention_hours: int = 168  # 7 days
    
    def __post_init__(self):
        if not self.pii_patterns:
            self.pii_patterns = DEFAULT_PII_PATTERNS
        if not self.sensitive_fields:
            self.sensitive_fields = DEFAULT_SENSITIVE_FIELDS
        if not self.sensitive_headers:
            self.sensitive_headers = DEFAULT_SENSITIVE_HEADERS


# Default patterns
DEFAULT_PII_PATTERNS: List[Pattern] = [
    # Email addresses
    re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE),
    # Phone numbers
    re.compile(r'(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'),
    # SSN
    re.compile(r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'),
    # Credit card numbers
    re.compile(r'\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b'),
    # JWT tokens
    re.compile(r'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'),
    # IP addresses (optional - might be needed for debugging)
    # re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'),
]

DEFAULT_SENSITIVE_FIELDS = [
    'password',
    'passwd',
    'secret',
    'token',
    'access_token',
    'refresh_token',
    'api_key',
    'apikey',
    'authorization',
    'auth',
    'cookie',
    'session',
    'credit_card',
    'card_number',
    'cvv',
    'ssn',
    'social_security',
]

DEFAULT_SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'x-csrf-token',
]

# Global config
_config = PrivacyConfig()


def configure_privacy(config: PrivacyConfig) -> None:
    """Configure privacy settings."""
    global _config
    _config = config


def get_privacy_config() -> PrivacyConfig:
    """Get current privacy config."""
    return _config


# ===== PII SCRUBBING =====

def scrub_pii(text: str) -> str:
    """Remove PII from text using configured patterns."""
    if not text or not _config.enabled:
        return text
    
    result = text
    for pattern in _config.pii_patterns:
        result = pattern.sub('[REDACTED]', result)
    
    return result


def scrub_dict(data: Dict[str, Any], depth: int = 0, max_depth: int = 10) -> Dict[str, Any]:
    """
    Recursively scrub sensitive fields from a dictionary.
    """
    if depth > max_depth:
        return {"_truncated": True}
    
    if not isinstance(data, dict):
        return data
    
    result = {}
    
    for key, value in data.items():
        lower_key = key.lower()
        
        # Check if field is sensitive
        if any(sensitive in lower_key for sensitive in _config.sensitive_fields):
            result[key] = '[REDACTED]'
        elif isinstance(value, dict):
            result[key] = scrub_dict(value, depth + 1, max_depth)
        elif isinstance(value, list):
            result[key] = [
                scrub_dict(item, depth + 1, max_depth) if isinstance(item, dict) 
                else scrub_pii(str(item)) if isinstance(item, str) 
                else item
                for item in value
            ]
        elif isinstance(value, str):
            result[key] = scrub_pii(value)
        else:
            result[key] = value
    
    return result


def scrub_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Scrub sensitive headers."""
    result = {}
    
    for key, value in headers.items():
        lower_key = key.lower()
        
        if lower_key in _config.sensitive_headers:
            result[key] = '[REDACTED]'
        else:
            result[key] = scrub_pii(value)
    
    return result


def scrub_url(url: str) -> str:
    """
    Scrub sensitive query parameters from URL.
    Also normalizes IDs to prevent high cardinality.
    """
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
    
    try:
        parsed = urlparse(url)
        
        # Scrub query parameters
        query_params = parse_qs(parsed.query)
        scrubbed_params = {}
        
        for key, values in query_params.items():
            lower_key = key.lower()
            if any(sensitive in lower_key for sensitive in _config.sensitive_fields):
                scrubbed_params[key] = ['[REDACTED]']
            else:
                scrubbed_params[key] = [scrub_pii(v) for v in values]
        
        # Normalize path (replace UUIDs and numeric IDs)
        path = parsed.path
        # Replace UUIDs
        path = re.sub(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            ':id',
            path,
            flags=re.IGNORECASE
        )
        # Replace numeric IDs
        path = re.sub(r'/\d+', '/:id', path)
        
        return urlunparse((
            parsed.scheme,
            parsed.netloc,
            path,
            parsed.params,
            urlencode(scrubbed_params, doseq=True),
            ''  # No fragment
        ))
    except Exception:
        return scrub_pii(url)


def truncate_payload(payload: str) -> str:
    """Truncate payload to configured max size."""
    if len(payload) <= _config.max_payload_size:
        return payload
    return payload[:_config.max_payload_size] + '...[TRUNCATED]'


# ===== ANONYMIZATION =====

def anonymize_id(user_id: str) -> str:
    """
    Anonymize a user ID for metrics while maintaining consistency.
    Same input always produces same output.
    """
    if not _config.anonymize_user_ids:
        return user_id
    
    # Use HMAC-like construction with salt
    salted = f"{_config.anonymization_salt}:{user_id}"
    hashed = hashlib.sha256(salted.encode()).hexdigest()
    
    # Return first 16 chars for readability
    return f"anon_{hashed[:16]}"


def anonymize_ip(ip: str) -> str:
    """
    Anonymize IP address by zeroing last octet (IPv4) or last 80 bits (IPv6).
    """
    if '.' in ip:
        # IPv4
        parts = ip.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.0"
    elif ':' in ip:
        # IPv6 - zero last 5 groups
        parts = ip.split(':')
        if len(parts) >= 4:
            return ':'.join(parts[:3]) + ':0:0:0:0:0'
    
    return '[ANONYMIZED_IP]'


# ===== SAMPLING =====

@dataclass
class SamplingRates:
    """Sampling rates for different data types."""
    
    traces: float = 0.1      # 10% of requests
    errors: float = 1.0      # 100% of errors
    slow_requests: float = 1.0  # 100% of slow requests
    metrics: float = 1.0     # 100% of metrics (aggregated anyway)
    
    # Per-endpoint overrides
    endpoint_rates: Dict[str, float] = field(default_factory=dict)


_sampling_rates = SamplingRates()


def configure_sampling(rates: SamplingRates) -> None:
    """Configure sampling rates."""
    global _sampling_rates
    _sampling_rates = rates


def should_sample_trace(endpoint: str, is_error: bool = False, is_slow: bool = False) -> bool:
    """Determine if a trace should be sampled."""
    import random
    
    # Always sample errors if configured
    if is_error and _sampling_rates.errors >= 1.0:
        return True
    if is_error and random.random() < _sampling_rates.errors:
        return True
    
    # Always sample slow requests if configured
    if is_slow and _sampling_rates.slow_requests >= 1.0:
        return True
    if is_slow and random.random() < _sampling_rates.slow_requests:
        return True
    
    # Check endpoint-specific rate
    for pattern, rate in _sampling_rates.endpoint_rates.items():
        if pattern in endpoint:
            return random.random() < rate
    
    # Default rate
    return random.random() < _sampling_rates.traces


# ===== DATA RETENTION =====

class RetentionManager:
    """
    Manages data retention for traces and metrics.
    
    Usage:
        retention = RetentionManager()
        retention.cleanup_expired()
    """
    
    def __init__(self, storage_backend=None):
        self.storage = storage_backend
        self._last_cleanup = datetime.utcnow()
    
    def should_cleanup(self) -> bool:
        """Check if cleanup should run (max once per hour)."""
        return datetime.utcnow() - self._last_cleanup > timedelta(hours=1)
    
    def cleanup_expired_traces(self) -> int:
        """
        Remove traces older than retention period.
        Returns number of traces removed.
        """
        if not self.storage:
            return 0
        
        cutoff = datetime.utcnow() - timedelta(hours=_config.trace_retention_hours)
        # Implementation depends on storage backend
        # Example: self.storage.delete_traces_before(cutoff)
        return 0
    
    def cleanup_expired_metrics(self) -> int:
        """
        Remove metrics older than retention period.
        Returns number of metric points removed.
        """
        if not self.storage:
            return 0
        
        cutoff = datetime.utcnow() - timedelta(hours=_config.metric_retention_hours)
        # Implementation depends on storage backend
        return 0
    
    def cleanup_expired(self) -> Dict[str, int]:
        """Run all cleanup tasks."""
        if not self.should_cleanup():
            return {"skipped": True}
        
        self._last_cleanup = datetime.utcnow()
        
        return {
            "traces_removed": self.cleanup_expired_traces(),
            "metrics_removed": self.cleanup_expired_metrics(),
        }


# ===== LOGGING FILTER =====

class PIIScrubFilter(logging.Filter):
    """
    Logging filter that scrubs PII from log messages.
    
    Usage:
        handler = logging.StreamHandler()
        handler.addFilter(PIIScrubFilter())
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        # Scrub the message
        if hasattr(record, 'msg') and isinstance(record.msg, str):
            record.msg = scrub_pii(record.msg)
        
        # Scrub args if present
        if record.args:
            if isinstance(record.args, dict):
                record.args = scrub_dict(record.args)
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    scrub_pii(str(arg)) if isinstance(arg, str) else arg
                    for arg in record.args
                )
        
        return True


def configure_pii_logging():
    """Configure all loggers to scrub PII."""
    root_logger = logging.getLogger()
    pii_filter = PIIScrubFilter()
    
    for handler in root_logger.handlers:
        handler.addFilter(pii_filter)
    
    # Also add to specific loggers
    for name in ['uvicorn', 'fastapi', 'sqlalchemy']:
        logger = logging.getLogger(name)
        for handler in logger.handlers:
            handler.addFilter(pii_filter)
