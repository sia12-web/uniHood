"""
Middleware package for the Divan backend.

Available middleware:
- PerformanceMiddleware: Tracks API latency and error rates
- TracingMiddleware: Distributed tracing with W3C Trace Context
- Privacy utilities: PII scrubbing and sampling controls
"""

from .performance import (
    PerformanceMiddleware,
    create_metrics_router,
    get_metrics_store,
    track_db_query,
)

from .tracing import (
    TracingMiddleware,
    TraceContext,
    SamplingConfig,
    get_current_trace,
    get_trace_id,
    get_span_id,
    traced,
    traced_sync,
    configure_sampling,
    configure_trace_logging,
    TraceContextFilter,
)

from .privacy import (
    PrivacyConfig,
    SamplingRates,
    configure_privacy,
    get_privacy_config,
    configure_sampling as configure_privacy_sampling,
    scrub_pii,
    scrub_dict,
    scrub_headers,
    scrub_url,
    truncate_payload,
    anonymize_id,
    anonymize_ip,
    should_sample_trace,
    RetentionManager,
    PIIScrubFilter,
    configure_pii_logging,
)

__all__ = [
    # Performance
    "PerformanceMiddleware",
    "create_metrics_router",
    "get_metrics_store",
    "track_db_query",
    # Tracing
    "TracingMiddleware",
    "TraceContext",
    "SamplingConfig",
    "get_current_trace",
    "get_trace_id",
    "get_span_id",
    "traced",
    "traced_sync",
    "configure_sampling",
    "configure_trace_logging",
    "TraceContextFilter",
    # Privacy
    "PrivacyConfig",
    "SamplingRates",
    "configure_privacy",
    "get_privacy_config",
    "configure_privacy_sampling",
    "scrub_pii",
    "scrub_dict",
    "scrub_headers",
    "scrub_url",
    "truncate_payload",
    "anonymize_id",
    "anonymize_ip",
    "should_sample_trace",
    "RetentionManager",
    "PIIScrubFilter",
    "configure_pii_logging",
]
