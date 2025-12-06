/**
 * Distributed Tracing - Correlation ID Management
 * 
 * Generates and propagates trace/correlation IDs across:
 * - Frontend RUM events
 * - API requests (fetch/axios)
 * - Backend services
 * - K6 load tests
 * 
 * Uses W3C Trace Context standard (traceparent header)
 * https://www.w3.org/TR/trace-context/
 */

// Trace context format: {version}-{trace-id}-{parent-id}-{flags}
// Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

export interface TraceContext {
  traceId: string;      // 32 hex chars (128-bit)
  spanId: string;       // 16 hex chars (64-bit)
  parentSpanId?: string;
  sampled: boolean;
  baggage?: Record<string, string>;
}

/**
 * Generate a random hex string of specified length
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a new trace ID (128-bit, 32 hex chars)
 */
export function generateTraceId(): string {
  return randomHex(32);
}

/**
 * Generate a new span ID (64-bit, 16 hex chars)
 */
export function generateSpanId(): string {
  return randomHex(16);
}

/**
 * Create a new trace context
 */
export function createTraceContext(sampled: boolean = true): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    sampled,
  };
}

/**
 * Create a child span from parent context
 */
export function createChildContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    sampled: parent.sampled,
    baggage: parent.baggage,
  };
}

/**
 * Format trace context as W3C traceparent header
 */
export function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent header
 */
export function parseTraceparent(header: string): TraceContext | null {
  const match = header.match(
    /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i
  );
  
  if (!match) return null;
  
  const [, version, traceId, spanId, flags] = match;
  
  // Only support version 00 for now
  if (version !== '00') return null;
  
  return {
    traceId,
    spanId,
    sampled: (parseInt(flags, 16) & 0x01) === 0x01,
  };
}

/**
 * Format baggage as W3C baggage header
 */
export function formatBaggage(baggage: Record<string, string>): string {
  return Object.entries(baggage)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join(',');
}

/**
 * Parse W3C baggage header
 */
export function parseBaggage(header: string): Record<string, string> {
  const baggage: Record<string, string> = {};
  
  for (const pair of header.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (key && value) {
      baggage[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  
  return baggage;
}

// ===== TRACE CONTEXT STORAGE =====

const TRACE_STORAGE_KEY = 'divan_trace_context';
const SESSION_STORAGE_KEY = 'divan_session_trace';

/**
 * Get or create trace context for current page/session
 */
export function getPageTraceContext(): TraceContext {
  if (typeof window === 'undefined') {
    return createTraceContext();
  }
  
  // Try to get existing context from session
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore storage errors
  }
  
  // Create new context with sampling decision
  const sampled = shouldSample();
  const ctx = createTraceContext(sampled);
  
  // Store in session
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // Ignore storage errors
  }
  
  return ctx;
}

/**
 * Create a request span from page context
 */
export function createRequestSpan(): TraceContext {
  const pageCtx = getPageTraceContext();
  return createChildContext(pageCtx);
}

// ===== SAMPLING =====

let _sampleRate = 0.1; // Default 10%
let _forceSampled: boolean | null = null;

/**
 * Configure sampling rate
 */
export function setSampleRate(rate: number): void {
  _sampleRate = Math.max(0, Math.min(1, rate));
}

/**
 * Get current sampling rate (for x-rum-sample-rate header)
 */
export function getSampleRate(): number {
  return _sampleRate;
}

/**
 * Force sampling on/off for debugging
 */
export function forceSampling(sampled: boolean | null): void {
  _forceSampled = sampled;
}

/**
 * Determine if current trace should be sampled
 */
export function shouldSample(): boolean {
  if (_forceSampled !== null) return _forceSampled;
  return Math.random() < _sampleRate;
}

// ===== HEADER INJECTION =====

/**
 * Get trace headers to inject into requests
 */
export function getTraceHeaders(ctx?: TraceContext): Record<string, string> {
  const context = ctx || createRequestSpan();
  
  const headers: Record<string, string> = {
    'traceparent': formatTraceparent(context),
    'x-trace-id': context.traceId,
    'x-span-id': context.spanId,
    'x-request-id': `${context.traceId.slice(0, 8)}-${Date.now().toString(36)}`,
  };
  
  if (context.parentSpanId) {
    headers['x-parent-span-id'] = context.parentSpanId;
  }
  
  if (context.baggage && Object.keys(context.baggage).length > 0) {
    headers['baggage'] = formatBaggage(context.baggage);
  }
  
  return headers;
}

/**
 * Extract trace context from response headers
 */
export function extractTraceFromResponse(headers: Headers): Partial<TraceContext> {
  const result: Partial<TraceContext> = {};
  
  const traceparent = headers.get('traceparent');
  if (traceparent) {
    const parsed = parseTraceparent(traceparent);
    if (parsed) {
      Object.assign(result, parsed);
    }
  }
  
  // Also check custom headers
  const traceId = headers.get('x-trace-id');
  const spanId = headers.get('x-span-id');
  
  if (traceId) result.traceId = traceId;
  if (spanId) result.spanId = spanId;
  
  return result;
}
