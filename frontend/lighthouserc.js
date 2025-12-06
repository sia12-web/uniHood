/**
 * Lighthouse CI Configuration
 * 
 * Performance Budgets & KPIs:
 * - LCP (Largest Contentful Paint): < 2.5s (good), < 4s (needs improvement)
 * - FCP (First Contentful Paint): < 1.8s (good), < 3s (needs improvement)  
 * - TTI (Time to Interactive): < 3.8s (good), < 7.3s (needs improvement)
 * - TBT (Total Blocking Time): < 200ms (good), < 600ms (needs improvement)
 * - CLS (Cumulative Layout Shift): < 0.1 (good), < 0.25 (needs improvement)
 * - TTFB (Time to First Byte): < 800ms (good), < 1800ms (needs improvement)
 */

module.exports = {
  ci: {
    collect: {
      // Use the built Next.js app
      staticDistDir: '.next',
      // Or for server mode:
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'ready on',
      startServerReadyTimeout: 30000,
      
      // URLs to audit - adjust based on your routes
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/login',
        'http://localhost:3000/discover',
      ],
      
      // Run multiple times for consistency
      numberOfRuns: 3,
      
      settings: {
        // Simulate mobile device (default Lighthouse behavior)
        preset: 'desktop', // or 'mobile' for mobile metrics
        
        // Throttling settings for realistic conditions
        throttling: {
          // Simulated 4G connection
          rttMs: 150,
          throughputKbps: 1600,
          cpuSlowdownMultiplier: 4,
        },
        
        // Skip certain audits if needed
        skipAudits: [
          'uses-http2', // May not apply to local testing
        ],
      },
    },
    
    assert: {
      // Performance budgets - FAIL CI if thresholds exceeded
      assertions: {
        // ===== CORE WEB VITALS =====
        
        // LCP: Largest Contentful Paint
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        
        // FCP: First Contentful Paint  
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        
        // CLS: Cumulative Layout Shift
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        
        // TBT: Total Blocking Time (proxy for TTI)
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        
        // ===== PERFORMANCE SCORE =====
        'categories:performance': ['error', { minScore: 0.9 }], // 90+ score
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        
        // ===== RESOURCE BUDGETS =====
        
        // JavaScript bundle size
        'resource-summary:script:size': ['error', { maxNumericValue: 500000 }], // 500KB
        
        // Total page weight
        'resource-summary:total:size': ['warn', { maxNumericValue: 2000000 }], // 2MB
        
        // Third-party scripts
        'resource-summary:third-party:size': ['warn', { maxNumericValue: 200000 }], // 200KB
        
        // ===== ADDITIONAL METRICS =====
        
        // Speed Index
        'speed-index': ['warn', { maxNumericValue: 3400 }],
        
        // Time to Interactive
        'interactive': ['warn', { maxNumericValue: 3800 }],
        
        // Server response time (TTFB)
        'server-response-time': ['error', { maxNumericValue: 600 }],
        
        // Render-blocking resources
        'render-blocking-resources': ['warn', { maxLength: 2 }],
        
        // Unused JavaScript
        'unused-javascript': ['warn', { maxNumericValue: 100000 }], // 100KB unused JS
        
        // Image optimization
        'uses-optimized-images': 'warn',
        'uses-webp-images': 'warn',
        'uses-responsive-images': 'warn',
        
        // Font display
        'font-display': 'warn',
      },
    },
    
    upload: {
      // Upload to Lighthouse CI server (optional)
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.example.com',
      // token: process.env.LHCI_TOKEN,
      
      // Or upload to temporary public storage
      target: 'temporary-public-storage',
    },
  },
};
