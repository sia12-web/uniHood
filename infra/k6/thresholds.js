/**
 * K6 Performance Thresholds Configuration
 * 
 * Shared thresholds for all load tests.
 * These align with backend KPI targets.
 */

export const DEFAULT_THRESHOLDS = {
  // Request failures must be below 1%
  http_req_failed: ['rate<0.01'],
  
  // P95 latency must be under 150ms
  http_req_duration: ['p(95)<150', 'p(99)<300', 'med<50'],
  
  // Connection time budget
  http_req_connecting: ['p(95)<50'],
  
  // TLS handshake (if applicable)
  http_req_tls_handshaking: ['p(95)<100'],
  
  // Waiting time (TTFB)
  http_req_waiting: ['p(95)<100'],
};

export const STRICT_THRESHOLDS = {
  ...DEFAULT_THRESHOLDS,
  http_req_failed: ['rate<0.001'],  // 0.1% error rate
  http_req_duration: ['p(95)<100', 'p(99)<200'],
};

export const RELAXED_THRESHOLDS = {
  ...DEFAULT_THRESHOLDS,
  http_req_failed: ['rate<0.05'],  // 5% error rate
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
};

/**
 * Standard load profiles
 */
export const LOAD_PROFILES = {
  // Quick smoke test
  smoke: {
    stages: [
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
  },
  
  // Standard load test
  load: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 0 },
    ],
  },
  
  // Stress test (find breaking point)
  stress: {
    stages: [
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '5m', target: 200 },
      { duration: '2m', target: 300 },
      { duration: '5m', target: 300 },
      { duration: '5m', target: 0 },
    ],
  },
  
  // Spike test
  spike: {
    stages: [
      { duration: '1m', target: 10 },
      { duration: '10s', target: 200 },
      { duration: '3m', target: 200 },
      { duration: '10s', target: 10 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
  },
  
  // Soak test (endurance)
  soak: {
    stages: [
      { duration: '5m', target: 50 },
      { duration: '30m', target: 50 },
      { duration: '5m', target: 0 },
    ],
  },
};

/**
 * Endpoint-specific thresholds
 */
export const ENDPOINT_THRESHOLDS = {
  // Auth should be fast
  auth: {
    http_req_duration: ['p(95)<200', 'p(99)<400'],
  },
  
  // Chat messages need real-time feel
  chat: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
  },
  
  // Discovery/search can be slower
  discovery: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
  
  // User profile reads
  profile: {
    http_req_duration: ['p(95)<150', 'p(99)<300'],
  },
};

/**
 * Helper to merge thresholds
 */
export function mergeThresholds(...thresholdSets) {
  const result = {};
  for (const set of thresholdSets) {
    for (const [key, value] of Object.entries(set)) {
      if (result[key]) {
        result[key] = [...result[key], ...value];
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Create options object with profile and thresholds
 */
export function createOptions(profile = 'load', thresholds = DEFAULT_THRESHOLDS) {
  return {
    ...LOAD_PROFILES[profile],
    thresholds,
  };
}
