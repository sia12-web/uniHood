# Performance Measurement & Optimization Framework

This document outlines the performance measurement strategy for Divan. **Every optimization must have a measurable KPI**.

## 📊 Key Performance Indicators (KPIs)

### Frontend (Core Web Vitals)

| Metric | Target (Good) | Warning | Unit | How to Measure |
|--------|---------------|---------|------|----------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | < 4.0s | ms | Lighthouse, web-vitals |
| **FCP** (First Contentful Paint) | < 1.8s | < 3.0s | ms | Lighthouse, web-vitals |
| **CLS** (Cumulative Layout Shift) | < 0.1 | < 0.25 | score | Lighthouse, web-vitals |
| **FID** (First Input Delay) | < 100ms | < 300ms | ms | web-vitals RUM |
| **INP** (Interaction to Next Paint) | < 200ms | < 500ms | ms | web-vitals RUM |
| **TTFB** (Time to First Byte) | < 800ms | < 1800ms | ms | Lighthouse, web-vitals |
| **TTI** (Time to Interactive) | < 3.8s | < 7.3s | ms | Lighthouse |

### Backend API

| Metric | Target (Good) | Warning | Unit | How to Measure |
|--------|---------------|---------|------|----------------|
| **P50 Latency** | < 50ms | < 100ms | ms | Prometheus histogram |
| **P95 Latency** | < 150ms | < 300ms | ms | Prometheus histogram |
| **P99 Latency** | < 300ms | < 500ms | ms | Prometheus histogram |
| **5xx Error Rate** | < 0.1% | < 1.0% | % | Prometheus counter |
| **DB Query P95** | < 50ms | < 100ms | ms | Prometheus histogram |

### Infrastructure

| Metric | Target (Good) | Warning | Unit | How to Measure |
|--------|---------------|---------|------|----------------|
| **CPU Usage** | < 50% | < 80% | % | Prometheus/Grafana |
| **Memory Usage** | < 60% | < 85% | % | Prometheus/Grafana |
| **Redis P95 Latency** | < 5ms | < 20ms | ms | Redis metrics |

---

## 🔧 Measurement Tools

### 1. Frontend: Lighthouse CI

```bash
# Install
npm install -g @lhci/cli

# Run locally
cd frontend
npm run build
lhci autorun --config=./lighthouserc.js

# View report
open .lighthouseci/
```

Lighthouse CI is configured in `frontend/lighthouserc.js` with performance budgets.

### 2. Frontend: Web Vitals RUM

```tsx
// In app/layout.tsx or a client component
import { initPerformanceMonitoring } from '@/lib/performance';

useEffect(() => {
  initPerformanceMonitoring({
    debug: process.env.NODE_ENV === 'development',
    sampleRate: 0.1, // 10% of production users
    analyticsEndpoint: '/api/analytics/vitals',
  });
}, []);
```

### 3. Backend: Prometheus Metrics

Add the performance middleware to your FastAPI app:

```python
from app.middleware.performance import PerformanceMiddleware, create_metrics_router

app = FastAPI()
app.add_middleware(PerformanceMiddleware)
app.include_router(create_metrics_router())
```

View metrics at:
- `/metrics` - Prometheus format
- `/perf/stats` - JSON endpoint stats
- `/perf/summary` - High-level summary

### 4. Load Testing: K6

```bash
# Smoke test (quick validation)
k6 run -e K6_BACKEND_URL=http://localhost:8000 infra/k6/chat_send_load.js

# Full load test
k6 run --vus 100 --duration 5m infra/k6/chat_send_load.js
```

K6 thresholds are defined in the test files:
- `http_req_failed`: < 1% error rate
- `http_req_duration`: P95 < 150ms

---

## 🚀 CI Integration

The CI pipeline automatically checks:

1. **Bundle Size** - Fails if JS chunks exceed 500KB
2. **Lighthouse Score** - Warns if performance < 90
3. **Performance Budgets** - Enforced via `lighthouserc.js`
4. **K6 Smoke Test** - Runs on main branch merges

### PR Comments

Every PR gets a Lighthouse report comment showing:
- Performance/Accessibility/SEO scores
- Core Web Vitals status
- Bundle size changes

---

## 📈 Optimization Workflow

### Before Optimizing

1. **Measure current state** - Run Lighthouse, check P95 latencies
2. **Define success metric** - Pick a specific KPI from the tables above
3. **Set target** - e.g., "Reduce LCP from 3.2s to 2.5s"

### During Development

1. **Make small changes** - One optimization at a time
2. **Measure after each change** - Compare to baseline
3. **Document the delta** - Include in PR description

### Example PR Description

```markdown
## Performance Optimization: Image Lazy Loading

### KPI: LCP (Largest Contentful Paint)
- **Before**: 3.2s
- **After**: 2.4s
- **Improvement**: 25% reduction

### Changes
- Added `loading="lazy"` to below-fold images
- Preloaded hero image

### Evidence
![Lighthouse comparison](screenshot.png)
```

### A/B Testing / Canary

For significant changes:

1. **Feature flag** the optimization
2. **Deploy to 10%** of users
3. **Compare RUM metrics** between control and experiment
4. **Roll out gradually** if metrics improve

---

## 🎯 Performance Budget Violations

When budgets are exceeded:

| Severity | Action |
|----------|--------|
| 🔴 **Critical** (>warning) | Block PR merge, investigate immediately |
| 🟡 **Warning** (>target) | PR can merge with justification, create tech debt ticket |
| 🟢 **Good** (≤target) | No action needed |

### Common Fixes

| Issue | Typical Fix |
|-------|-------------|
| High LCP | Optimize images, preload critical resources |
| High CLS | Set explicit dimensions on images/iframes |
| High TBT/FID | Code split, defer non-critical JS |
| High TTFB | Optimize server, add caching |
| Large bundles | Tree shaking, dynamic imports |

---

## 🔗 Distributed Tracing

All components use W3C Trace Context for correlation across:
- Frontend RUM events
- Backend API requests  
- K6 load tests
- Prometheus metrics (debug mode)

### Headers

| Header | Format | Purpose |
|--------|--------|---------|
| `traceparent` | `00-{traceId}-{spanId}-{flags}` | W3C standard trace propagation |
| `baggage` | `key=value,key2=value2` | W3C baggage for metadata |
| `x-trace-id` | 32 hex chars | Custom trace ID header |
| `x-span-id` | 16 hex chars | Current span ID |
| `x-request-id` | String | Human-readable request ID |
| `x-rum-sample-rate` | Float (0-1) | Frontend sampling rate for backend correlation |

### Environment Variables for Tracing

| Variable | Default | Purpose |
|----------|---------|---------|
| `PERF_DEBUG_MODE` | `false` | Enable verbose performance logging |
| `PERF_TRACE_LABELS` | `false` | Add trace_id to Prometheus metrics (⚠️ high cardinality) |
| `RUM_SAMPLE_RATE` | `0.1` | Frontend sampling rate |
| `TRACE_SAMPLE_RATE` | `0.1` | Backend trace sampling rate |

### Prometheus Debug Metrics

When `PERF_TRACE_LABELS=true`, an additional metric is exported:

```prometheus
# High-cardinality metric for debugging specific traces
divan_http_request_duration_debug_seconds{method="GET",endpoint="/api/users",status="200",trace_id="abc123def456..."}
```

⚠️ **Warning**: Only enable `PERF_TRACE_LABELS` during profiling sessions. The unbounded trace_id label causes high cardinality.

### Grafana Dashboard

Import `infra/grafana/dashboards/divan-tracing.json` for:
- P95 latency by endpoint
- Request rate by endpoint  
- Trace-specific latency drill-down (when debug mode enabled)
- Sampled requests rate
- Error analysis by status code

Use the `$trace_id` template variable to filter to specific traces.

### Frontend Usage

```tsx
import { getPageTraceContext, getTraceHeaders } from '@/lib/performance';

// Get current page's trace context
const ctx = getPageTraceContext();
console.log('Page trace:', ctx.traceId);

// Trace headers are auto-injected by instrumented fetch
// For manual requests:
const headers = getTraceHeaders();
fetch('/api/data', { headers });
```

### Backend Usage

```python
from app.middleware import (
    TracingMiddleware, 
    get_current_trace,
    traced
)

# Add middleware
app.add_middleware(TracingMiddleware)

# Access trace in handlers
@app.get("/api/data")
async def get_data(request: Request):
    trace = get_current_trace()
    logger.info(f"Processing request", extra={"trace_id": trace.trace_id})

# Trace async functions
@traced("fetch_user")
async def fetch_user(user_id: str):
    ...
```

### K6 Load Test Correlation

```bash
# Run with custom run ID for easy filtering
k6 run -e K6_RUN_ID=perf-test-001 infra/k6/api_load_test.js

# Filter backend logs by trace
grep "trace=abc123" backend.log
```

---

## 🔒 Privacy & Sampling Controls

### Sampling Rates (Configurable)

| Data Type | Default Rate | Notes |
|-----------|--------------|-------|
| Web Vitals | 10% | Core metrics for all users sampled |
| API Latency | 5% | Per-request timing |
| Errors | 100% | Always capture for debugging |
| User Interactions | 1% | Click/input tracking |

### PII Protection

All monitoring automatically scrubs:
- Email addresses
- Phone numbers
- Credit card numbers
- JWT/Bearer tokens
- Sensitive URL parameters (token, password, etc.)

### Frontend Configuration

```tsx
import { 
  initPerformanceMonitoring, 
  setConsent,
  configurePrivacy 
} from '@/lib/performance';

// Set user consent (required before tracking)
setConsent(userAcceptedAnalytics);

initPerformanceMonitoring({
  sampleRate: 0.1,
  privacy: {
    retentionHours: 24,
    maxPayloadSize: 1024,
  },
});
```

### Backend Configuration

```python
from app.middleware import (
    configure_privacy,
    configure_sampling,
    PrivacyConfig,
    SamplingRates,
)

configure_privacy(PrivacyConfig(
    anonymize_user_ids=True,
    trace_retention_hours=24,
    metric_retention_hours=168,
))

configure_sampling(SamplingRates(
    default_rate=0.1,
    errors=1.0,  # Always sample errors
    slow_request_threshold_ms=500,
))
```

---

## 📁 File Structure

```
frontend/
├── lighthouserc.js              # Lighthouse CI config & budgets
├── lib/performance/
│   ├── index.ts                 # Main exports & initialization
│   ├── web-vitals-reporter.ts   # Core Web Vitals tracking
│   ├── api-interceptor.ts       # API latency tracking with tracing
│   ├── tracing.ts               # W3C Trace Context implementation
│   └── privacy.ts               # PII scrubbing & sampling

backend/
├── app/middleware/
│   ├── __init__.py              # Middleware exports
│   ├── performance.py           # FastAPI performance middleware
│   ├── tracing.py               # Distributed tracing middleware
│   └── privacy.py               # PII scrubbing & sampling
├── config/
│   ├── performance_budgets.py   # Budget definitions
│   └── sampling.yml             # Sampling rates & privacy config

infra/
├── k6/
│   ├── thresholds.js            # Shared K6 thresholds
│   ├── api_load_test.js         # API load tests with tracing
│   ├── chat_send_load.js        # Chat-specific load test
│   └── proximity_nearby_load.js # Proximity load test with tracing
├── grafana/dashboards/
│   ├── divan-dashboard.json     # Main HTTP metrics
│   └── divan-tracing.json       # Trace correlation dashboard
├── prometheus/rules-phase8.yml  # Alerting rules
```

---

## 🔗 Related Resources

- [web.dev Core Web Vitals](https://web.dev/vitals/)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)
- [K6 Documentation](https://k6.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
