/**
 * API Performance Interceptor
 * 
 * Wraps fetch/axios to automatically track:
 * - Response times (P50, P95, P99)
 * - Error rates
 * - Payload sizes
 * - Distributed trace correlation
 * 
 * KPIs:
 * - P95 API latency: < 150ms target
 * - Error rate: < 1% target
 */

import { APILatencyTracker } from './web-vitals-reporter';
import { getTraceHeaders, createRequestSpan, extractTraceFromResponse, getSampleRate } from './tracing';
import {
  shouldSampleMetric,
  scrubUrl,
  scrubError,
  isTrackingAllowed
} from './privacy';

interface RequestMetrics {
  endpoint: string;
  method: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  success: boolean;
  requestSize?: number;
  responseSize?: number;
  error?: string;
  // Tracing fields
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  sampled?: boolean;
  // Server-side trace correlation
  serverSpanId?: string;
}

type MetricsCallback = (metrics: RequestMetrics) => void;

const metricsCallbacks: MetricsCallback[] = [];

/**
 * Register a callback to receive API metrics
 */
export function onAPIMetrics(callback: MetricsCallback) {
  metricsCallbacks.push(callback);
  return () => {
    const index = metricsCallbacks.indexOf(callback);
    if (index > -1) metricsCallbacks.splice(index, 1);
  };
}

/**
 * Emit metrics to all registered callbacks
 */
function emitMetrics(metrics: RequestMetrics) {
  // Check if tracking is allowed and should be sampled
  if (!isTrackingAllowed() || !shouldSampleMetric('apiLatency', metrics.endpoint)) {
    return;
  }

  const tracker = APILatencyTracker.getInstance();
  if (metrics.duration) {
    tracker.record(metrics.endpoint, metrics.duration);
  }

  // Scrub sensitive data before emitting
  const scrubbedMetrics = {
    ...metrics,
    endpoint: scrubUrl(metrics.endpoint),
    error: metrics.error ? scrubError(metrics.error).message : undefined,
  };

  metricsCallbacks.forEach((cb) => {
    try {
      cb(scrubbedMetrics);
    } catch (e) {
      console.warn('Metrics callback error:', e);
    }
  });
}

/**
 * Extract endpoint pattern from URL (normalize IDs)
 */
function normalizeEndpoint(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    // Replace UUIDs and numeric IDs with placeholders
    return parsed.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  } catch {
    return url;
  }
}

/**
 * Instrumented fetch wrapper with distributed tracing
 */
export function createInstrumentedFetch(originalFetch: typeof fetch = fetch): typeof fetch {
  return async function instrumentedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    const endpoint = normalizeEndpoint(url);

    // Create trace context for this request
    const traceCtx = createRequestSpan();

    const metrics: RequestMetrics = {
      endpoint,
      method,
      startTime: performance.now(),
      success: false,
      traceId: traceCtx.traceId,
      spanId: traceCtx.spanId,
      parentSpanId: traceCtx.parentSpanId,
      sampled: traceCtx.sampled,
    };

    // Inject trace headers into request
    const traceHeaders = getTraceHeaders(traceCtx);
    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(traceHeaders)) {
      headers.set(key, value);
    }
    // Add RUM sample rate for backend correlation
    headers.set('x-rum-sample-rate', String(getSampleRate()));

    // Measure request size
    if (init?.body) {
      if (typeof init.body === 'string') {
        metrics.requestSize = new Blob([init.body]).size;
      } else if (init.body instanceof Blob) {
        metrics.requestSize = init.body.size;
      }
    }

    try {
      // Use modified init with trace headers
      const modifiedInit = { ...init, headers };
      const response = await originalFetch(input, modifiedInit);

      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.status = response.status;
      metrics.success = response.ok;

      // Extract server-side trace context from response for RUM linking
      const serverTrace = extractTraceFromResponse(response.headers);
      if (serverTrace.spanId) {
        metrics.serverSpanId = serverTrace.spanId;
      }

      // Clone response to read size without consuming body
      const cloned = response.clone();
      try {
        const blob = await cloned.blob();
        metrics.responseSize = blob.size;
      } catch {
        // Ignore if we can't read the response
      }

      emitMetrics(metrics);

      // Log slow requests in development (with trace ID for correlation)
      if (process.env.NODE_ENV === 'development' && metrics.duration > 150) {
        console.warn(
          `🐢 Slow API call: ${method} ${endpoint} took ${metrics.duration.toFixed(0)}ms ` +
          `[trace=${metrics.traceId?.slice(0, 8)}]`
        );
      }

      return response;
    } catch (error) {
      metrics.endTime = performance.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = false;
      metrics.error = error instanceof Error ? error.message : 'Unknown error';

      emitMetrics(metrics);
      throw error;
    }
  };
}

/**
 * Axios interceptor factory
 */
export function createAxiosInterceptors() {
  const pendingRequests = new Map<string, RequestMetrics>();

  return {
    request: {
      onFulfilled: (config: { url?: string; method?: string; data?: unknown; headers?: Record<string, string> }) => {
        const requestId = `${Date.now()}-${Math.random()}`;
        const url = config.url || '';
        const method = (config.method || 'GET').toUpperCase();

        const metrics: RequestMetrics = {
          endpoint: normalizeEndpoint(url),
          method,
          startTime: performance.now(),
          success: false,
        };

        if (config.data) {
          try {
            metrics.requestSize = new Blob([JSON.stringify(config.data)]).size;
          } catch {
            // Ignore
          }
        }

        pendingRequests.set(requestId, metrics);

        // Attach request ID to headers for tracking
        config.headers = config.headers || {};
        config.headers['X-Request-Id'] = requestId;

        return config;
      },
    },
    response: {
      onFulfilled: (response: { config?: { headers?: Record<string, string> }; status?: number; data?: unknown }) => {
        const requestId = response.config?.headers?.['X-Request-Id'];
        if (requestId) {
          const metrics = pendingRequests.get(requestId);
          if (metrics) {
            metrics.endTime = performance.now();
            metrics.duration = metrics.endTime - metrics.startTime;
            metrics.status = response.status;
            metrics.success = true;

            if (response.data) {
              try {
                metrics.responseSize = new Blob([JSON.stringify(response.data)]).size;
              } catch {
                // Ignore
              }
            }

            emitMetrics(metrics);
            pendingRequests.delete(requestId);
          }
        }
        return response;
      },
      onRejected: (error: { config?: { headers?: Record<string, string> }; response?: { status?: number }; message?: string }) => {
        const requestId = error.config?.headers?.['X-Request-Id'];
        if (requestId) {
          const metrics = pendingRequests.get(requestId);
          if (metrics) {
            metrics.endTime = performance.now();
            metrics.duration = metrics.endTime - metrics.startTime;
            metrics.status = error.response?.status;
            metrics.success = false;
            metrics.error = error.message;

            emitMetrics(metrics);
            pendingRequests.delete(requestId);
          }
        }
        throw error;
      },
    },
  };
}

/**
 * Performance budget checker for API calls
 */
export interface APIBudget {
  endpoint: string | RegExp;
  maxLatencyMs: number;
  maxPayloadBytes?: number;
}

export function createBudgetChecker(budgets: APIBudget[]) {
  return onAPIMetrics((metrics) => {
    for (const budget of budgets) {
      const matches = typeof budget.endpoint === 'string'
        ? metrics.endpoint === budget.endpoint
        : budget.endpoint.test(metrics.endpoint);

      if (!matches) continue;

      const violations: string[] = [];

      if (metrics.duration && metrics.duration > budget.maxLatencyMs) {
        violations.push(
          `Latency ${metrics.duration.toFixed(0)}ms exceeds budget ${budget.maxLatencyMs}ms`
        );
      }

      if (budget.maxPayloadBytes && metrics.responseSize && metrics.responseSize > budget.maxPayloadBytes) {
        violations.push(
          `Response size ${metrics.responseSize} bytes exceeds budget ${budget.maxPayloadBytes} bytes`
        );
      }

      if (violations.length > 0) {
        console.warn(
          `⚠️ Performance budget violation for ${metrics.method} ${metrics.endpoint}:\n` +
          violations.map((v) => `  - ${v}`).join('\n')
        );
      }
    }
  });
}
