"""
Unit tests for Docker Log Monitor pattern matching.
Run with: python -m pytest test_patterns.py -v
"""
import pytest
from patterns import PatternMatcher, Severity, extract_timestamp
from config import PatternConfig


class TestPatternMatcher:
    """Tests for pattern matching functionality."""
    
    @pytest.fixture
    def matcher(self):
        """Create a default pattern matcher."""
        return PatternMatcher(PatternConfig())
    
    def test_error_detection(self, matcher):
        """Test that ERROR patterns are detected."""
        result = matcher.match("2024-01-15 10:30:45 ERROR: Database connection failed", "backend")
        assert result.matched is True
        assert result.severity == Severity.ERROR
        assert result.container == "backend"
    
    def test_exception_detection(self, matcher):
        """Test that Exception patterns are detected."""
        result = matcher.match("ValueError: Invalid input provided", "backend")
        assert result.matched is False  # Just ValueError, not "Exception"
        
        result = matcher.match("Exception: Something went wrong", "backend")
        assert result.matched is True
        assert result.severity == Severity.ERROR
    
    def test_traceback_detection(self, matcher):
        """Test Traceback detection."""
        result = matcher.match("Traceback (most recent call last):", "backend")
        assert result.matched is True
        assert result.severity == Severity.ERROR
    
    def test_critical_severity(self, matcher):
        """Test CRITICAL/FATAL patterns get critical severity."""
        result = matcher.match("FATAL: System crash imminent", "backend")
        assert result.matched is True
        assert result.severity == Severity.CRITICAL
        
        result = matcher.match("CRITICAL: Memory exhausted", "backend")
        assert result.matched is True
        assert result.severity == Severity.CRITICAL
    
    def test_warning_detection(self, matcher):
        """Test WARNING patterns are detected."""
        result = matcher.match("WARNING: Configuration deprecated", "backend")
        assert result.matched is True
        assert result.severity == Severity.WARNING
    
    def test_normal_log_not_matched(self, matcher):
        """Test normal logs don't trigger alerts."""
        result = matcher.match("INFO: Server started successfully", "backend")
        assert result.matched is False
        assert result.severity == Severity.INFO
    
    def test_ignore_patterns(self, matcher):
        """Test that ignore patterns are respected."""
        result = matcher.match("ERROR in HealthCheck endpoint", "backend")
        assert result.matched is False  # Ignored due to HealthCheck
        
        result = matcher.match("GET /health returned 200", "backend")
        assert result.matched is False
    
    def test_case_insensitive(self, matcher):
        """Test case-insensitive matching."""
        result = matcher.match("error: something failed", "backend")
        assert result.matched is True
        
        result = matcher.match("warning: please update", "backend")
        assert result.matched is True


class TestTimestampExtraction:
    """Tests for timestamp extraction."""
    
    def test_iso8601_timestamp(self):
        """Test ISO 8601 timestamp extraction."""
        timestamp, rest = extract_timestamp("2024-01-15T10:30:45.123Z ERROR: Test")
        assert timestamp == "2024-01-15T10:30:45.123Z"
        assert rest.strip() == "ERROR: Test"
    
    def test_no_timestamp(self):
        """Test lines without timestamp."""
        timestamp, rest = extract_timestamp("ERROR: No timestamp here")
        assert timestamp is None
        assert rest == "ERROR: No timestamp here"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
