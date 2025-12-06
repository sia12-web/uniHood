"""
Distributed Tracing Middleware for FastAPI

Implements W3C Trace Context standard for correlation across:
- Frontend RUM
- Backend API requests
- K6 load tests
- Database queries

Headers supported:
- traceparent: W3C trace context
- baggage: W3C baggage
- x-trace-id, x-span-id, x-request-id: Custom headers for compatibility
"""

import secrets
import time
import logging
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Callable
from functools import wraps

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ===== TRACE CONTEXT =====

@dataclass
class TraceContext:
    """W3C Trace Context compatible trace information."""
    
    trace_id: str  # 32 hex chars (128-bit)
    span_id: str   # 16 hex chars (64-bit)
    parent_span_id: Optional[str] = None
    sampled: bool = True
    baggage: Dict[str, str] = field(default_factory=dict)
    
    # Additional metadata
    service_name: str = "divan-backend"
    start_time: float = field(default_factory=time.perf_counter)
    
    def to_traceparent(self) -> str:
        """Format as W3C traceparent header."""
        flags = "01" if self.sampled else "00"
        return f"00-{self.trace_id}-{self.span_id}-{flags}"
    
    def to_baggage(self) -> str:
        """Format as W3C baggage header."""
        if not self.baggage:
            return ""
        return ",".join(
            f"{k}={v}" for k, v in self.baggage.items()
        )
    
    @classmethod
    def from_traceparent(cls, header: str) -> Optional["TraceContext"]:
        """Parse W3C traceparent header."""
        try:
            parts = header.split("-")
            if len(parts) != 4:
                return None
            
            version, trace_id, span_id, flags = parts
            
            if version != "00":
                return None
            if len(trace_id) != 32 or len(span_id) != 16:
                return None
            
            sampled = (int(flags, 16) & 0x01) == 0x01
            
            return cls(
                trace_id=trace_id,
                span_id=span_id,
                sampled=sampled,
            )
        except Exception:
            return None
    
    @classmethod
    def from_baggage(cls, header: str) -> Dict[str, str]:
        """Parse W3C baggage header."""
        baggage = {}
        for pair in header.split(","):
            pair = pair.strip()
            if "=" in pair:
                key, value = pair.split("=", 1)
                baggage[key.strip()] = value.strip()
        return baggage


def generate_trace_id() -> str:
    """Generate a new 128-bit trace ID (32 hex chars)."""
    return secrets.token_hex(16)


def generate_span_id() -> str:
    """Generate a new 64-bit span ID (16 hex chars)."""
    return secrets.token_hex(8)


# ===== CONTEXT VARIABLES =====

# Current trace context for this request
_current_trace: ContextVar[Optional[TraceContext]] = ContextVar(
    "current_trace", default=None
)


def get_current_trace() -> Optional[TraceContext]:
    """Get the current trace context."""
    return _current_trace.get()


def set_current_trace(ctx: TraceContext) -> None:
    """Set the current trace context."""
    _current_trace.set(ctx)


def get_trace_id() -> Optional[str]:
    """Get the current trace ID (convenience function)."""
    ctx = get_current_trace()
    return ctx.trace_id if ctx else None


def get_span_id() -> Optional[str]:
    """Get the current span ID (convenience function)."""
    ctx = get_current_trace()
    return ctx.span_id if ctx else None


# ===== SAMPLING =====

@dataclass
class SamplingConfig:
    """Configuration for trace sampling."""
    
    # Base sampling rate (0-1)
    default_rate: float = 0.1
    
    # Per-endpoint sampling rates
    endpoint_rates: Dict[str, float] = field(default_factory=dict)
    
    # Always sample errors
    always_sample_errors: bool = True
    
    # Always sample slow requests (>threshold ms)
    slow_request_threshold_ms: float = 500
    
    # Force sampling for specific trace IDs (for debugging)
    force_sampled_traces: set = field(default_factory=set)


_sampling_config = SamplingConfig()


def configure_sampling(config: SamplingConfig) -> None:
    """Configure trace sampling."""
    global _sampling_config
    _sampling_config = config


def should_sample(endpoint: str, trace_id: Optional[str] = None) -> bool:
    """Determine if a request should be sampled."""
    # Check forced traces
    if trace_id and trace_id in _sampling_config.force_sampled_traces:
        return True
    
    # Check endpoint-specific rate
    for pattern, rate in _sampling_config.endpoint_rates.items():
        if pattern in endpoint:
            return secrets.randbelow(1000) < (rate * 1000)
    
    # Use default rate
    return secrets.randbelow(1000) < (_sampling_config.default_rate * 1000)


# ===== MIDDLEWARE =====

class TracingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for distributed tracing.
    
    Extracts trace context from incoming requests and propagates it
    through the request lifecycle.
    
    Usage:
        app = FastAPI()
        app.add_middleware(TracingMiddleware)
    """
    
    def __init__(
        self,
        app,
        service_name: str = "divan-backend",
        sampling_config: Optional[SamplingConfig] = None,
    ):
        super().__init__(app)
        self.service_name = service_name
        if sampling_config:
            configure_sampling(sampling_config)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract or create trace context
        ctx = self._extract_trace_context(request)
        
        # Store in context var
        set_current_trace(ctx)
        
        # Add trace info to request state for handlers
        request.state.trace_context = ctx
        
        try:
            response = await call_next(request)
            
            # Inject trace headers into response
            self._inject_response_headers(response, ctx)
            
            return response
        except Exception as e:
            # Log error with trace context
            logger.error(
                f"Request failed: {e}",
                extra={
                    "trace_id": ctx.trace_id,
                    "span_id": ctx.span_id,
                    "endpoint": request.url.path,
                }
            )
            raise
        finally:
            # Clear context
            _current_trace.set(None)
    
    def _extract_trace_context(self, request: Request) -> TraceContext:
        """Extract trace context from request headers."""
        
        # Try W3C traceparent header first
        traceparent = request.headers.get("traceparent")
        if traceparent:
            ctx = TraceContext.from_traceparent(traceparent)
            if ctx:
                # Create child span
                ctx = TraceContext(
                    trace_id=ctx.trace_id,
                    span_id=generate_span_id(),
                    parent_span_id=ctx.span_id,
                    sampled=ctx.sampled,
                    service_name=self.service_name,
                )
                
                # Parse baggage
                baggage = request.headers.get("baggage")
                if baggage:
                    ctx.baggage = TraceContext.from_baggage(baggage)
                
                return ctx
        
        # Try custom headers
        trace_id = request.headers.get("x-trace-id")
        parent_span_id = request.headers.get("x-span-id")
        
        if trace_id:
            return TraceContext(
                trace_id=trace_id,
                span_id=generate_span_id(),
                parent_span_id=parent_span_id,
                sampled=should_sample(request.url.path, trace_id),
                service_name=self.service_name,
            )
        
        # Create new trace
        new_trace_id = generate_trace_id()
        return TraceContext(
            trace_id=new_trace_id,
            span_id=generate_span_id(),
            sampled=should_sample(request.url.path, new_trace_id),
            service_name=self.service_name,
        )
    
    def _inject_response_headers(self, response: Response, ctx: TraceContext) -> None:
        """Inject trace headers into response."""
        response.headers["traceparent"] = ctx.to_traceparent()
        response.headers["x-trace-id"] = ctx.trace_id
        response.headers["x-span-id"] = ctx.span_id
        
        if ctx.parent_span_id:
            response.headers["x-parent-span-id"] = ctx.parent_span_id


# ===== DECORATORS =====

def traced(name: Optional[str] = None):
    """
    Decorator to create a child span for a function.
    
    Usage:
        @traced("fetch_user_data")
        async def get_user(user_id: str):
            ...
    """
    def decorator(func: Callable):
        span_name = name or func.__name__
        
        @wraps(func)
        async def wrapper(*args, **kwargs):
            parent = get_current_trace()
            
            if parent and parent.sampled:
                # Create child span
                child = TraceContext(
                    trace_id=parent.trace_id,
                    span_id=generate_span_id(),
                    parent_span_id=parent.span_id,
                    sampled=parent.sampled,
                    baggage=parent.baggage,
                    service_name=parent.service_name,
                )
                
                set_current_trace(child)
                start_time = time.perf_counter()
                
                try:
                    result = await func(*args, **kwargs)
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    
                    logger.debug(
                        f"Span {span_name} completed",
                        extra={
                            "trace_id": child.trace_id,
                            "span_id": child.span_id,
                            "duration_ms": duration_ms,
                        }
                    )
                    
                    return result
                finally:
                    set_current_trace(parent)
            else:
                return await func(*args, **kwargs)
        
        return wrapper
    return decorator


def traced_sync(name: Optional[str] = None):
    """Synchronous version of @traced decorator."""
    def decorator(func: Callable):
        span_name = name or func.__name__
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            parent = get_current_trace()
            
            if parent and parent.sampled:
                child = TraceContext(
                    trace_id=parent.trace_id,
                    span_id=generate_span_id(),
                    parent_span_id=parent.span_id,
                    sampled=parent.sampled,
                    baggage=parent.baggage,
                    service_name=parent.service_name,
                )
                
                set_current_trace(child)
                start_time = time.perf_counter()
                
                try:
                    return func(*args, **kwargs)
                finally:
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    logger.debug(
                        f"Span {span_name} completed",
                        extra={
                            "trace_id": child.trace_id,
                            "span_id": child.span_id,
                            "duration_ms": duration_ms,
                        }
                    )
                    set_current_trace(parent)
            else:
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


# ===== LOGGING INTEGRATION =====

class TraceContextFilter(logging.Filter):
    """
    Logging filter that adds trace context to log records.
    
    Usage:
        handler = logging.StreamHandler()
        handler.addFilter(TraceContextFilter())
        
        # Then use in format string:
        formatter = logging.Formatter(
            '%(asctime)s [%(trace_id)s] %(message)s'
        )
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        ctx = get_current_trace()
        
        record.trace_id = ctx.trace_id if ctx else "-"
        record.span_id = ctx.span_id if ctx else "-"
        record.parent_span_id = ctx.parent_span_id if ctx else "-"
        record.sampled = ctx.sampled if ctx else False
        
        return True


def configure_trace_logging():
    """Configure logging to include trace context."""
    
    # Add filter to root logger
    root_logger = logging.getLogger()
    root_logger.addFilter(TraceContextFilter())
    
    # Update format to include trace_id
    for handler in root_logger.handlers:
        if handler.formatter:
            fmt = handler.formatter._fmt
            if "trace_id" not in fmt:
                new_fmt = fmt.replace(
                    "%(message)s",
                    "[trace=%(trace_id)s] %(message)s"
                )
                handler.setFormatter(logging.Formatter(new_fmt))
