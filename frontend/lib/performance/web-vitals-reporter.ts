/**
 * Web Vitals Performance Reporter
 * 
 * Measures and reports Core Web Vitals and custom metrics.
 * 
 * KPIs tracked:
 * - LCP (Largest Contentful Paint): < 2.5s target
 * - FCP (First Contentful Paint): < 1.8s target
 * - FID (First Input Delay): < 100ms target
 * - CLS (Cumulative Layout Shift): < 0.1 target
 * - TTFB (Time to First Byte): < 800ms target
 * - INP (Interaction to Next Paint): < 200ms target
 */

import { onCLS, onFCP, onFID, onLCP, onTTFB, onINP, Metric } from 'web-vitals';

// Performance thresholds (in ms for timing, unitless for CLS)
export const PERFORMANCE_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FCP: { good: 1800, needsImprovement: 3000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  TTFB: { good: 800, needsImprovement: 1800 },
  INP: { good: 200, needsImprovement: 500 },
  TTI: { good: 3800, needsImprovement: 7300 },
} as const;

export type MetricName = keyof typeof PERFORMANCE_THRESHOLDS;
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

interface PerformanceEntry {
  name: MetricName;
  value: number;
  rating: MetricRating;
  delta: number;
  id: string;
  timestamp: number;
  url: string;
  navigationType: string;
}

interface ReporterOptions {
  /** Enable console logging in development */
  debug?: boolean;
  /** Analytics endpoint URL */
  analyticsEndpoint?: string;
  /** Sample rate (0-1) for sending to analytics */
  sampleRate?: number;
  /** Custom tags to include with metrics */
  tags?: Record<string, string>;
}

/**
 * Get rating based on metric value and thresholds
 */
function getRating(name: MetricName, value: number): MetricRating {
  const threshold = PERFORMANCE_THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Format metric value for display
 */
function formatValue(name: MetricName, value: number): string {
  if (name === 'CLS') {
    return value.toFixed(3);
  }
  return `${Math.round(value)}ms`;
}

/**
 * Queue for batching metrics before sending
 */
class MetricsQueue {
  private queue: PerformanceEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushInterval = 5000; // 5 seconds
  private readonly maxQueueSize = 10;

  constructor(private onFlush: (entries: PerformanceEntry[]) => void) {}

  add(entry: PerformanceEntry) {
    this.queue.push(entry);
    
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.queue.length > 0) {
      const entries = [...this.queue];
      this.queue = [];
      this.onFlush(entries);
    }
  }
}

/**
 * Initialize Web Vitals reporting
 */
export function initWebVitals(options: ReporterOptions = {}) {
  const {
    debug = process.env.NODE_ENV === 'development',
    analyticsEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT,
    sampleRate = 1.0,
    tags = {},
  } = options;

  // Determine if this session should be sampled
  const shouldSample = Math.random() < sampleRate;

  const queue = new MetricsQueue((entries) => {
    if (analyticsEndpoint && shouldSample) {
      sendToAnalytics(analyticsEndpoint, entries, tags);
    }
  });

  const handleMetric = (metric: Metric) => {
    const entry: PerformanceEntry = {
      name: metric.name as MetricName,
      value: metric.value,
      rating: getRating(metric.name as MetricName, metric.value),
      delta: metric.delta,
      id: metric.id,
      timestamp: Date.now(),
      url: window.location.href,
      navigationType: getNavigationType(),
    };

    // Log in development
    if (debug) {
      const color = entry.rating === 'good' ? '🟢' : entry.rating === 'needs-improvement' ? '🟡' : '🔴';
      console.log(
        `${color} ${entry.name}: ${formatValue(entry.name, entry.value)} (${entry.rating})`
      );
    }

    // Queue for batch sending
    queue.add(entry);

    // Dispatch custom event for other listeners
    window.dispatchEvent(new CustomEvent('web-vital', { detail: entry }));
  };

  // Register all web vitals
  onCLS(handleMetric);
  onFCP(handleMetric);
  onFID(handleMetric);
  onLCP(handleMetric);
  onTTFB(handleMetric);
  onINP(handleMetric);

  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        queue.flush();
      }
    });

    window.addEventListener('pagehide', () => {
      queue.flush();
    });
  }

  return {
    flush: () => queue.flush(),
  };
}

/**
 * Get navigation type for context
 */
function getNavigationType(): string {
  if (typeof window === 'undefined') return 'unknown';
  
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return nav?.type || 'unknown';
}

/**
 * Send metrics to analytics endpoint
 */
async function sendToAnalytics(
  endpoint: string,
  entries: PerformanceEntry[],
  tags: Record<string, string>
) {
  try {
    const payload = {
      entries,
      metadata: {
        ...tags,
        userAgent: navigator.userAgent,
        connection: getConnectionInfo(),
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        timestamp: Date.now(),
      },
    };

    // Use sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, JSON.stringify(payload));
    } else {
      await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      });
    }
  } catch (error) {
    console.warn('Failed to send performance metrics:', error);
  }
}

/**
 * Get connection information if available
 */
function getConnectionInfo(): Record<string, unknown> | null {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return null;
  
  return {
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData,
  };
}

interface NetworkInformation {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

/**
 * Custom performance mark helper
 */
export function measureCustomMetric(name: string, startMark: string, endMark?: string) {
  if (typeof window === 'undefined' || !window.performance) return null;

  try {
    if (endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name, startMark);
    }
    
    const entries = performance.getEntriesByName(name, 'measure');
    const entry = entries[entries.length - 1];
    
    return entry ? entry.duration : null;
  } catch (error) {
    console.warn(`Failed to measure ${name}:`, error);
    return null;
  }
}

/**
 * React hook for tracking component render time
 */
export function useRenderTime(componentName: string) {
  if (typeof window === 'undefined') return;

  const startTime = performance.now();
  
  // Use requestAnimationFrame to measure after paint
  requestAnimationFrame(() => {
    const duration = performance.now() - startTime;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ ${componentName} render: ${duration.toFixed(2)}ms`);
    }
    
    // Track slow renders
    if (duration > 16) { // > 1 frame at 60fps
      window.dispatchEvent(new CustomEvent('slow-render', {
        detail: { componentName, duration },
      }));
    }
  });
}

/**
 * API latency tracker
 */
export class APILatencyTracker {
  private static instance: APILatencyTracker;
  private latencies: Map<string, number[]> = new Map();

  static getInstance() {
    if (!this.instance) {
      this.instance = new APILatencyTracker();
    }
    return this.instance;
  }

  record(endpoint: string, latencyMs: number) {
    const existing = this.latencies.get(endpoint) || [];
    existing.push(latencyMs);
    
    // Keep only last 100 measurements
    if (existing.length > 100) {
      existing.shift();
    }
    
    this.latencies.set(endpoint, existing);
  }

  getP95(endpoint: string): number | null {
    const values = this.latencies.get(endpoint);
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }

  getStats(endpoint: string) {
    const values = this.latencies.get(endpoint);
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  getAllStats() {
    const stats: Record<string, ReturnType<typeof this.getStats>> = {};
    const entries = Array.from(this.latencies.entries());
    for (const [endpoint] of entries) {
      stats[endpoint] = this.getStats(endpoint);
    }
    return stats;
  }
}
