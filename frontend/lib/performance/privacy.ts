/**
 * Privacy & Sampling Controls for Performance Monitoring
 * 
 * Implements:
 * - PII scrubbing from URLs, payloads, and error messages
 * - Configurable sampling rates per metric type
 * - Data retention policies
 * - User consent integration
 */

export interface PrivacyConfig {
  /** Enable/disable all tracking */
  enabled: boolean;
  
  /** User has consented to performance tracking */
  hasConsent: boolean;
  
  /** Sampling rates by metric type (0-1) */
  sampling: {
    webVitals: number;
    apiLatency: number;
    errors: number;
    userInteractions: number;
  };
  
  /** PII patterns to scrub */
  piiPatterns: RegExp[];
  
  /** URL parameters to redact */
  sensitiveParams: string[];
  
  /** Headers to never log */
  sensitiveHeaders: string[];
  
  /** Max payload size to capture (bytes) */
  maxPayloadSize: number;
  
  /** Data retention period (hours) */
  retentionHours: number;
}

const DEFAULT_CONFIG: PrivacyConfig = {
  enabled: true,
  hasConsent: false,
  
  sampling: {
    webVitals: 0.1,      // 10% of page loads
    apiLatency: 0.05,    // 5% of API calls
    errors: 1.0,         // 100% of errors (important for debugging)
    userInteractions: 0.01, // 1% of interactions
  },
  
  piiPatterns: [
    // Email addresses
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    // Phone numbers (various formats)
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    // SSN
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    // Credit card numbers
    /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,
    // JWT tokens
    /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    // Bearer tokens
    /Bearer\s+[a-zA-Z0-9_-]+/gi,
    // API keys (common patterns)
    /(?:api[_-]?key|apikey|access[_-]?token)[=:]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi,
  ],
  
  sensitiveParams: [
    'token',
    'access_token',
    'refresh_token',
    'api_key',
    'apikey',
    'password',
    'passwd',
    'secret',
    'auth',
    'authorization',
    'session',
    'sessionid',
    'session_id',
    'email',
    'phone',
    'ssn',
    'credit_card',
    'card_number',
  ],
  
  sensitiveHeaders: [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
  ],
  
  maxPayloadSize: 1024, // 1KB max
  retentionHours: 24,
};

let _config: PrivacyConfig = { ...DEFAULT_CONFIG };

/**
 * Configure privacy settings
 */
export function configurePrivacy(config: Partial<PrivacyConfig>): void {
  _config = {
    ..._config,
    ...config,
    sampling: { ..._config.sampling, ...config.sampling },
  };
}

/**
 * Get current privacy config
 */
export function getPrivacyConfig(): Readonly<PrivacyConfig> {
  return _config;
}

/**
 * Check if tracking is allowed
 */
export function isTrackingAllowed(): boolean {
  return _config.enabled && _config.hasConsent;
}

/**
 * Set user consent status
 */
export function setConsent(hasConsent: boolean): void {
  _config.hasConsent = hasConsent;
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('divan_perf_consent', hasConsent ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Load consent from storage
 */
export function loadConsent(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const stored = localStorage.getItem('divan_perf_consent');
    if (stored === '1') {
      _config.hasConsent = true;
      return true;
    }
  } catch {
    // Ignore storage errors
  }
  
  return false;
}

// ===== SAMPLING =====

type MetricType = keyof PrivacyConfig['sampling'];

const _sampleDecisions = new Map<string, boolean>();

/**
 * Determine if a metric should be sampled
 */
export function shouldSampleMetric(type: MetricType, key?: string): boolean {
  if (!isTrackingAllowed()) return false;
  
  // Use cached decision for same key within session
  const cacheKey = `${type}:${key || 'default'}`;
  if (_sampleDecisions.has(cacheKey)) {
    return _sampleDecisions.get(cacheKey)!;
  }
  
  const rate = _config.sampling[type];
  const sampled = Math.random() < rate;
  
  // Cache decision
  _sampleDecisions.set(cacheKey, sampled);
  
  return sampled;
}

/**
 * Get effective sample rate for metric type
 */
export function getSampleRate(type: MetricType): number {
  return _config.sampling[type];
}

/**
 * Update sample rate for metric type
 */
export function setSampleRate(type: MetricType, rate: number): void {
  _config.sampling[type] = Math.max(0, Math.min(1, rate));
  // Clear cached decisions for this type
  const keys = Array.from(_sampleDecisions.keys());
  for (const key of keys) {
    if (key.startsWith(`${type}:`)) {
      _sampleDecisions.delete(key);
    }
  }
}

// ===== PII SCRUBBING =====

/**
 * Scrub PII from a string
 */
export function scrubPII(input: string): string {
  if (!input) return input;
  
  let result = input;
  
  for (const pattern of _config.piiPatterns) {
    // Reset regex state
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  
  return result;
}

/**
 * Scrub sensitive parameters from URL
 */
export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    
    // Scrub sensitive query params
    for (const param of _config.sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }
    
    // Scrub path segments that look like IDs/tokens
    const pathParts = parsed.pathname.split('/');
    const scrubbedPath = pathParts.map((part) => {
      // Keep short segments and common paths
      if (part.length < 20) return part;
      
      // Redact long alphanumeric segments (likely tokens/IDs)
      if (/^[a-zA-Z0-9_-]{20,}$/.test(part)) {
        return '[REDACTED_ID]';
      }
      
      return part;
    });
    
    parsed.pathname = scrubbedPath.join('/');
    
    // Return just path + query for relative URLs
    return parsed.pathname + parsed.search;
  } catch {
    // If parsing fails, do basic scrubbing
    return scrubPII(url);
  }
}

/**
 * Scrub sensitive headers
 */
export function scrubHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    
    if (_config.sensitiveHeaders.includes(lowerKey)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = scrubPII(value);
    }
  }
  
  return result;
}

/**
 * Scrub and truncate payload
 */
export function scrubPayload(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  
  let str: string;
  
  if (typeof payload === 'string') {
    str = payload;
  } else {
    try {
      str = JSON.stringify(payload);
    } catch {
      return '[UNSERIALIZABLE]';
    }
  }
  
  // Truncate if too large
  if (str.length > _config.maxPayloadSize) {
    str = str.slice(0, _config.maxPayloadSize) + '...[TRUNCATED]';
  }
  
  return scrubPII(str);
}

/**
 * Scrub error message and stack trace
 */
export function scrubError(error: Error | string): { message: string; stack?: string } {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;
  
  return {
    message: scrubPII(message),
    stack: stack ? scrubPII(stack) : undefined,
  };
}

// ===== DATA RETENTION =====

interface StoredMetric {
  timestamp: number;
  data: unknown;
}

const METRICS_STORAGE_KEY = 'divan_perf_metrics';

/**
 * Store metric with retention policy
 */
export function storeMetric(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(METRICS_STORAGE_KEY);
    const metrics: Record<string, StoredMetric[]> = stored ? JSON.parse(stored) : {};
    
    if (!metrics[key]) {
      metrics[key] = [];
    }
    
    metrics[key].push({
      timestamp: Date.now(),
      data,
    });
    
    // Enforce retention policy
    const cutoff = Date.now() - _config.retentionHours * 60 * 60 * 1000;
    metrics[key] = metrics[key].filter((m) => m.timestamp > cutoff);
    
    // Limit stored metrics per key
    if (metrics[key].length > 100) {
      metrics[key] = metrics[key].slice(-100);
    }
    
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Clear all stored metrics
 */
export function clearStoredMetrics(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(METRICS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Purge expired metrics
 */
export function purgeExpiredMetrics(): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const stored = localStorage.getItem(METRICS_STORAGE_KEY);
    if (!stored) return 0;
    
    const metrics: Record<string, StoredMetric[]> = JSON.parse(stored);
    const cutoff = Date.now() - _config.retentionHours * 60 * 60 * 1000;
    
    let purged = 0;
    
    for (const key of Object.keys(metrics)) {
      const before = metrics[key].length;
      metrics[key] = metrics[key].filter((m) => m.timestamp > cutoff);
      purged += before - metrics[key].length;
      
      if (metrics[key].length === 0) {
        delete metrics[key];
      }
    }
    
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
    
    return purged;
  } catch {
    return 0;
  }
}
