"""
Log pattern matching engine for Docker Log Monitor.
"""
import re
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Tuple

from config import PatternConfig


class Severity(Enum):
    """Log severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class MatchResult:
    """Result of pattern matching on a log line."""
    matched: bool
    severity: Severity
    pattern: Optional[str] = None
    line: str = ""
    container: str = ""


class PatternMatcher:
    """Regex-based log pattern matching engine."""
    
    def __init__(self, config: PatternConfig):
        self.config = config
        
        # Compile patterns for performance
        self._error_patterns = [
            re.compile(p, re.IGNORECASE) for p in config.error_patterns
        ]
        self._warning_patterns = [
            re.compile(p, re.IGNORECASE) for p in config.warning_patterns
        ]
        self._ignore_patterns = [
            re.compile(p, re.IGNORECASE) for p in config.ignore_patterns
        ]
    
    def should_ignore(self, line: str) -> bool:
        """Check if line matches any ignore pattern."""
        return any(pattern.search(line) for pattern in self._ignore_patterns)
    
    def match(self, line: str, container_name: str = "") -> MatchResult:
        """
        Match a log line against configured patterns.
        
        Returns MatchResult with severity and matched pattern.
        """
        # Check ignore patterns first
        if self.should_ignore(line):
            return MatchResult(
                matched=False,
                severity=Severity.INFO,
                line=line,
                container=container_name
            )
        
        # Check error patterns (higher priority)
        for pattern in self._error_patterns:
            if pattern.search(line):
                # Determine if it's critical based on specific patterns
                severity = Severity.CRITICAL if any(
                    kw in line.upper() for kw in ["FATAL", "PANIC", "CRITICAL"]
                ) else Severity.ERROR
                
                return MatchResult(
                    matched=True,
                    severity=severity,
                    pattern=pattern.pattern,
                    line=line,
                    container=container_name
                )
        
        # Check warning patterns
        for pattern in self._warning_patterns:
            if pattern.search(line):
                return MatchResult(
                    matched=True,
                    severity=Severity.WARNING,
                    pattern=pattern.pattern,
                    line=line,
                    container=container_name
                )
        
        # No match
        return MatchResult(
            matched=False,
            severity=Severity.INFO,
            line=line,
            container=container_name
        )
    
    def add_error_pattern(self, pattern: str) -> None:
        """Add a new error pattern at runtime."""
        self._error_patterns.append(re.compile(pattern, re.IGNORECASE))
        self.config.error_patterns.append(pattern)
    
    def add_warning_pattern(self, pattern: str) -> None:
        """Add a new warning pattern at runtime."""
        self._warning_patterns.append(re.compile(pattern, re.IGNORECASE))
        self.config.warning_patterns.append(pattern)
    
    def add_ignore_pattern(self, pattern: str) -> None:
        """Add a new ignore pattern at runtime."""
        self._ignore_patterns.append(re.compile(pattern, re.IGNORECASE))
        self.config.ignore_patterns.append(pattern)


def extract_timestamp(line: str) -> Tuple[Optional[str], str]:
    """
    Extract timestamp from log line if present.
    
    Returns (timestamp, remaining_line) tuple.
    Common formats: ISO 8601, syslog, etc.
    """
    # ISO 8601 format: 2024-01-15T10:30:45.123Z
    iso_pattern = re.compile(
        r'^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s*'
    )
    
    match = iso_pattern.match(line)
    if match:
        return match.group(1), line[match.end():]
    
    # Syslog format: Jan 15 10:30:45
    syslog_pattern = re.compile(
        r'^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s*'
    )
    
    match = syslog_pattern.match(line)
    if match:
        return match.group(1), line[match.end():]
    
    return None, line
