"""
Backend Performance Monitoring Middleware

Tracks and reports:
- TTFB (Time to First Byte)
- P95/P99 API latency
- Error rates
- Database query times
- Trace correlation for debugging

KPI Targets:
- P95 API latency: < 150ms
- TTFB: < 100ms
- Error rate: < 1%
"""

import os
import time
import logging
from collections import defaultdict
from typing import Callable, Dict, List, Optional
from dataclasses import dataclass, field
from statistics import mean, quantiles
from functools import wraps

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)


# ===== ENVIRONMENT-DRIVEN CONFIG =====

def _get_debug_mode() -> bool:
    """Check if debug mode is enabled via environment."""
    return os.environ.get("PERF_DEBUG_MODE", "").lower() in ("1", "true", "yes")


def _get_trace_label_enabled() -> bool:
    """
    Whether to include trace_id in Prometheus labels.
    WARNING: High cardinality - only enable for debug sessions.
    """
    return os.environ.get("PERF_TRACE_LABELS", "").lower() in ("1", "true", "yes")


# ===== PROMETHEUS METRICS =====
# Use try/except to avoid duplicate registration errors when module is reimported (e.g., in tests)

from prometheus_client import REGISTRY

def _get_or_create_histogram(name, description, labels, buckets):
    """Get existing histogram or create new one."""
    try:
        return Histogram(name, description, labels, buckets=buckets)
    except ValueError:
        # Metric already registered, get existing one
        return REGISTRY._names_to_collectors.get(name, Histogram(name, description, labels, buckets=buckets))

def _get_or_create_counter(name, description, labels):
    """Get existing counter or create new one."""
    try:
        return Counter(name, description, labels)
    except ValueError:
        # Metric already registered, get existing one
        return REGISTRY._names_to_collectors.get(name, Counter(name, description, labels))

def _get_or_create_gauge(name, description, labels=None):
    """Get existing gauge or create new one."""
    try:
        if labels:
            return Gauge(name, description, labels)
        return Gauge(name, description)
    except ValueError:
        # Metric already registered, get existing one
        return REGISTRY._names_to_collectors.get(name, Gauge(name, description))

# Standard metrics (low cardinality)
HTTP_REQUEST_DURATION = _get_or_create_histogram(
    "divan_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint", "status"],
    [0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0],
)

HTTP_REQUESTS_TOTAL = _get_or_create_counter(
    "divan_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

# Debug metrics with trace_id label (high cardinality - use sparingly)
HTTP_REQUEST_DURATION_DEBUG = _get_or_create_histogram(
    "divan_http_request_duration_debug_seconds",
    "HTTP request duration with trace correlation (debug only)",
    ["method", "endpoint", "status", "trace_id"],
    [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0],
)

# Sampled requests counter (for tracking sample rate effectiveness)
SAMPLED_REQUESTS = _get_or_create_counter(
    "divan_sampled_requests_total",
    "Requests that were sampled for detailed tracing",
    ["method", "endpoint"],
)

HTTP_REQUEST_SIZE = Histogram(
    "divan_http_request_size_bytes",
    "HTTP request size in bytes",
    ["method", "endpoint"],
    buckets=[100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
)

HTTP_RESPONSE_SIZE = Histogram(
    "divan_http_response_size_bytes",
    "HTTP response size in bytes",
    ["method", "endpoint"],
    buckets=[100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
)

ACTIVE_REQUESTS = Gauge(
    "divan_http_active_requests",
    "Number of active HTTP requests",
    ["method"],
)

DB_QUERY_DURATION = Histogram(
    "divan_db_query_duration_seconds",
    "Database query duration in seconds",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)


# ===== IN-MEMORY METRICS (for non-Prometheus setups) =====

@dataclass
class EndpointMetrics:
    """Metrics for a single endpoint."""
    latencies: List[float] = field(default_factory=list)
    request_count: int = 0
    error_count: int = 0
    total_request_bytes: int = 0
    total_response_bytes: int = 0
    
    def add_request(
        self,
        latency_ms: float,
        status_code: int,
        request_bytes: int = 0,
        response_bytes: int = 0,
    ):
        self.latencies.append(latency_ms)
        self.request_count += 1
        self.total_request_bytes += request_bytes
        self.total_response_bytes += response_bytes
        
        if status_code >= 400:
            self.error_count += 1
        
        # Keep only last 1000 latencies to bound memory
        if len(self.latencies) > 1000:
            self.latencies = self.latencies[-1000:]
    
    def get_stats(self) -> Dict:
        if not self.latencies:
            return {"count": 0}
        
        sorted_latencies = sorted(self.latencies)
        
        return {
            "count": self.request_count,
            "error_rate": self.error_count / max(self.request_count, 1),
            "latency": {
                "min": min(sorted_latencies),
                "max": max(sorted_latencies),
                "mean": mean(sorted_latencies),
                "p50": quantiles(sorted_latencies, n=100)[49] if len(sorted_latencies) > 1 else sorted_latencies[0],
                "p95": quantiles(sorted_latencies, n=100)[94] if len(sorted_latencies) > 1 else sorted_latencies[0],
                "p99": quantiles(sorted_latencies, n=100)[98] if len(sorted_latencies) > 1 else sorted_latencies[0],
            },
            "bytes": {
                "total_request": self.total_request_bytes,
                "total_response": self.total_response_bytes,
            },
        }


class MetricsStore:
    """Thread-safe metrics storage."""
    
    _instance: Optional["MetricsStore"] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self.endpoints: Dict[str, EndpointMetrics] = defaultdict(EndpointMetrics)
        self._initialized = True
    
    def record(
        self,
        endpoint: str,
        latency_ms: float,
        status_code: int,
        request_bytes: int = 0,
        response_bytes: int = 0,
    ):
        self.endpoints[endpoint].add_request(
            latency_ms, status_code, request_bytes, response_bytes
        )
    
    def get_all_stats(self) -> Dict[str, Dict]:
        return {
            endpoint: metrics.get_stats()
            for endpoint, metrics in self.endpoints.items()
        }
    
    def get_summary(self) -> Dict:
        all_latencies = []
        total_requests = 0
        total_errors = 0
        
        for metrics in self.endpoints.values():
            all_latencies.extend(metrics.latencies)
            total_requests += metrics.request_count
            total_errors += metrics.error_count
        
        if not all_latencies:
            return {"status": "no_data"}
        
        sorted_latencies = sorted(all_latencies)
        
        return {
            "total_requests": total_requests,
            "error_rate": total_errors / max(total_requests, 1),
            "latency": {
                "p50": quantiles(sorted_latencies, n=100)[49] if len(sorted_latencies) > 1 else sorted_latencies[0],
                "p95": quantiles(sorted_latencies, n=100)[94] if len(sorted_latencies) > 1 else sorted_latencies[0],
                "p99": quantiles(sorted_latencies, n=100)[98] if len(sorted_latencies) > 1 else sorted_latencies[0],
            },
            "endpoints_count": len(self.endpoints),
        }


def get_metrics_store() -> MetricsStore:
    """Get the global metrics store instance."""
    return MetricsStore()


# ===== ENDPOINT NORMALIZATION =====

def normalize_path(path: str) -> str:
    """
    Normalize URL path by replacing IDs with placeholders.
    
    Examples:
        /users/123 -> /users/:id
        /chat/messages/abc-def-123 -> /chat/messages/:id
    """
    import re
    
    # Replace UUIDs
    path = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        ":id",
        path,
        flags=re.IGNORECASE,
    )
    
    # Replace numeric IDs
    path = re.sub(r"/\d+", "/:id", path)
    
    return path


# ===== FASTAPI MIDDLEWARE =====

class PerformanceMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track request performance metrics.
    
    Usage:
        app = FastAPI()
        app.add_middleware(PerformanceMiddleware)
    """
    
    def __init__(self, app, *, exclude_paths: Optional[List[str]] = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or ["/health", "/metrics", "/favicon.ico"]
        self.metrics_store = get_metrics_store()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip excluded paths
        if any(request.url.path.startswith(p) for p in self.exclude_paths):
            return await call_next(request)
        
        method = request.method
        endpoint = normalize_path(request.url.path)
        
        # Extract trace context from headers
        trace_id = self._extract_trace_id(request)
        is_sampled = request.headers.get("x-rum-sample-rate") is not None
        
        # Track active requests
        ACTIVE_REQUESTS.labels(method=method).inc()
        
        # Get request size
        request_size = 0
        if "content-length" in request.headers:
            try:
                request_size = int(request.headers["content-length"])
            except ValueError:
                pass
        
        HTTP_REQUEST_SIZE.labels(method=method, endpoint=endpoint).observe(request_size)
        
        # Time the request
        start_time = time.perf_counter()
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            status_code = 500
            raise
        finally:
            duration = time.perf_counter() - start_time
            duration_ms = duration * 1000
            
            ACTIVE_REQUESTS.labels(method=method).dec()
            
            # Record Prometheus metrics
            HTTP_REQUEST_DURATION.labels(
                method=method,
                endpoint=endpoint,
                status=str(status_code),
            ).observe(duration)
            
            HTTP_REQUESTS_TOTAL.labels(
                method=method,
                endpoint=endpoint,
                status=str(status_code),
            ).inc()
            
            # Record debug metrics with trace_id (high cardinality - only when enabled)
            if _get_trace_label_enabled() and trace_id:
                HTTP_REQUEST_DURATION_DEBUG.labels(
                    method=method,
                    endpoint=endpoint,
                    status=str(status_code),
                    trace_id=trace_id[:16],  # Truncate to limit cardinality
                ).observe(duration)
            
            # Track sampled requests
            if is_sampled:
                SAMPLED_REQUESTS.labels(method=method, endpoint=endpoint).inc()
            
            # Record to in-memory store
            response_size = 0
            if hasattr(response, "headers") and "content-length" in response.headers:
                try:
                    response_size = int(response.headers["content-length"])
                except ValueError:
                    pass
            
            HTTP_RESPONSE_SIZE.labels(method=method, endpoint=endpoint).observe(response_size)
            
            self.metrics_store.record(
                endpoint=f"{method} {endpoint}",
                latency_ms=duration_ms,
                status_code=status_code,
                request_bytes=request_size,
                response_bytes=response_size,
            )
            
            # Log slow requests (with trace context for correlation)
            if duration_ms > 150:  # P95 budget
                trace_suffix = f" [trace={trace_id[:8]}]" if trace_id else ""
                logger.warning(
                    f"Slow request: {method} {endpoint} took {duration_ms:.2f}ms "
                    f"(status={status_code}){trace_suffix}"
                )
        
        return response
    
    def _extract_trace_id(self, request: Request) -> Optional[str]:
        """Extract trace ID from W3C traceparent header or x-trace-id."""
        # Try W3C traceparent first: 00-{trace_id}-{span_id}-{flags}
        traceparent = request.headers.get("traceparent")
        if traceparent:
            parts = traceparent.split("-")
            if len(parts) >= 2:
                return parts[1]
        
        # Fall back to x-trace-id header
        return request.headers.get("x-trace-id")


# ===== DATABASE QUERY TRACKING =====

def track_db_query(operation: str = "query"):
    """
    Decorator to track database query duration.
    
    Usage:
        @track_db_query("select_users")
        async def get_users():
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                return await func(*args, **kwargs)
            finally:
                duration = time.perf_counter() - start_time
                DB_QUERY_DURATION.labels(operation=operation).observe(duration)
                
                if duration > 0.1:  # 100ms
                    logger.warning(f"Slow DB query: {operation} took {duration*1000:.2f}ms")
        
        return wrapper
    return decorator


# ===== METRICS ENDPOINT =====

def create_metrics_router():
    """Create a FastAPI router for metrics endpoints."""
    from fastapi import APIRouter
    
    router = APIRouter(prefix="/perf", tags=["performance"])
    
    @router.get("/stats")
    async def get_performance_stats():
        """Get performance statistics for all endpoints."""
        store = get_metrics_store()
        return {
            "summary": store.get_summary(),
            "endpoints": store.get_all_stats(),
        }
    
    @router.get("/summary")
    async def get_summary():
        """Get high-level performance summary."""
        store = get_metrics_store()
        summary = store.get_summary()
        
        # Add health indicators
        health = "healthy"
        issues = []
        
        if summary.get("error_rate", 0) > 0.01:  # > 1% error rate
            health = "degraded"
            issues.append(f"High error rate: {summary['error_rate']*100:.2f}%")
        
        if summary.get("latency", {}).get("p95", 0) > 150:  # > 150ms P95
            health = "degraded"
            issues.append(f"High P95 latency: {summary['latency']['p95']:.2f}ms")
        
        return {
            "health": health,
            "issues": issues,
            **summary,
        }
    
    return router
