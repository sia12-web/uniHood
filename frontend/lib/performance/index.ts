/**
 * Performance Monitoring Module
 * 
 * Centralized exports for performance tracking utilities.
 * 
 * Usage:
 * ```tsx
 * // In app/layout.tsx or _app.tsx
 * import { initPerformanceMonitoring, setConsent } from '@/lib/performance';
 * 
 * useEffect(() => {
 *   // Set consent based on user preference
 *   setConsent(userHasConsented);
 *   
 *   initPerformanceMonitoring({
 *     debug: process.env.NODE_ENV === 'development',
 *     sampleRate: 0.1, // 10% of users
 *   });
 * }, []);
 * ```
 */

export {
  initWebVitals,
  PERFORMANCE_THRESHOLDS,
  measureCustomMetric,
  useRenderTime,
  APILatencyTracker,
  type MetricName,
  type MetricRating,
} from './web-vitals-reporter';

export {
  createInstrumentedFetch,
  createAxiosInterceptors,
  createBudgetChecker,
  onAPIMetrics,
  type APIBudget,
} from './api-interceptor';

// Distributed tracing exports
export {
  createTraceContext,
  createChildContext,
  createRequestSpan,
  getPageTraceContext,
  getTraceHeaders,
  formatTraceparent,
  parseTraceparent,
  generateTraceId,
  generateSpanId,
  setSampleRate as setTraceSampleRate,
  forceSampling,
  type TraceContext,
} from './tracing';

// Privacy and sampling exports
export {
  configurePrivacy,
  getPrivacyConfig,
  setConsent,
  loadConsent,
  isTrackingAllowed,
  shouldSampleMetric,
  getSampleRate,
  setSampleRate,
  scrubPII,
  scrubUrl,
  scrubHeaders,
  scrubPayload,
  scrubError,
  storeMetric,
  clearStoredMetrics,
  purgeExpiredMetrics,
  type PrivacyConfig,
} from './privacy';

interface PerformanceConfig {
  /** Enable console logging */
  debug?: boolean;
  /** Analytics endpoint for sending metrics */
  analyticsEndpoint?: string;
  /** Sampling rate (0-1) - applies to all metrics */
  sampleRate?: number;
  /** Custom tags */
  tags?: Record<string, string>;
  /** API performance budgets */
  apiBudgets?: import('./api-interceptor').APIBudget[];
  /** Whether to instrument global fetch */
  instrumentFetch?: boolean;
  /** Privacy configuration */
  privacy?: Partial<import('./privacy').PrivacyConfig>;
  /** Assume user has consented (for testing) */
  assumeConsent?: boolean;
}

/**
 * Initialize all performance monitoring
 */
export function initPerformanceMonitoring(config: PerformanceConfig = {}) {
  const {
    debug = process.env.NODE_ENV === 'development',
    analyticsEndpoint,
    sampleRate = 0.1, // Default to 10% sampling
    tags = {},
    apiBudgets = [],
    instrumentFetch = true,
    privacy = {},
    assumeConsent = false,
  } = config;

  // Only run in browser
  if (typeof window === 'undefined') return;

  // Configure privacy settings
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { configurePrivacy, loadConsent, setConsent } = require('./privacy');
  configurePrivacy({
    ...privacy,
    sampling: {
      webVitals: sampleRate,
      apiLatency: sampleRate * 0.5, // API metrics at half rate
      errors: 1.0, // Always capture errors
      userInteractions: sampleRate * 0.1, // Interactions at 10% of base rate
      ...privacy.sampling,
    },
  });

  // Load existing consent or assume consent for testing
  if (assumeConsent) {
    setConsent(true);
  } else {
    loadConsent();
  }

  // Configure trace sampling to match
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setSampleRate: setTraceSampleRate } = require('./tracing');
  setTraceSampleRate(sampleRate);

  // Initialize Web Vitals
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initWebVitals } = require('./web-vitals-reporter');
  const vitals = initWebVitals({
    debug,
    analyticsEndpoint,
    sampleRate,
    tags,
  });

  // Instrument fetch if requested
  if (instrumentFetch) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createInstrumentedFetch } = require('./api-interceptor');
    const originalFetch = window.fetch.bind(window);
    window.fetch = createInstrumentedFetch(originalFetch);
  }

  // Set up API budget checking
  if (apiBudgets.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createBudgetChecker } = require('./api-interceptor');
    createBudgetChecker(apiBudgets);
  }

  // Set up periodic cleanup of expired metrics
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { purgeExpiredMetrics } = require('./privacy');
  const cleanupInterval = setInterval(() => {
    const purged = purgeExpiredMetrics();
    if (debug && purged > 0) {
      console.log(`🧹 Purged ${purged} expired metrics`);
    }
  }, 60 * 60 * 1000); // Every hour

  // Log initialization
  if (debug) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPageTraceContext } = require('./tracing');
    const traceCtx = getPageTraceContext();
    console.log('📊 Performance monitoring initialized', {
      sampleRate,
      instrumentFetch,
      budgetCount: apiBudgets.length,
      traceId: traceCtx.traceId.slice(0, 8) + '...',
      sampled: traceCtx.sampled,
    });
  }

  return {
    flush: vitals.flush,
    cleanup: () => clearInterval(cleanupInterval),
  };
}

/**
 * Default API budgets based on common patterns
 */
export const DEFAULT_API_BUDGETS: import('./api-interceptor').APIBudget[] = [
  // Auth endpoints - should be fast
  { endpoint: /\/auth\//, maxLatencyMs: 200 },

  // Chat messages - real-time feel
  { endpoint: /\/chat\/messages/, maxLatencyMs: 150 },

  // User profile - moderate
  { endpoint: /\/users\//, maxLatencyMs: 300 },

  // Discovery/search - can be slower
  { endpoint: /\/discover/, maxLatencyMs: 500 },

  // Default for all other endpoints
  { endpoint: /.*/, maxLatencyMs: 400, maxPayloadBytes: 1024 * 100 }, // 100KB
];
