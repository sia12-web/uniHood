/**
 * Performance E2E Tests with Playwright
 * 
 * These tests measure real user journey performance including:
 * - Navigation timings
 * - Web Vitals (via Performance Observer)
 * - Multi-step flows with caching effects
 * 
 * Run with: npm run test:e2e -- --grep @perf
 */

import { test, expect, Page } from '@playwright/test';

// ============================================================================
// TEST DATA - Must match seeded data
// ============================================================================
const PERF_USER = {
  email: 'perf-test@example.com',
  password: 'PerfTest123!',
  handle: 'perf-test-user',
};

// ============================================================================
// HELPERS
// ============================================================================

interface PerfMetrics {
  url: string;
  navigationStart: number;
  domContentLoaded: number;
  loadComplete: number;
  lcp?: number;
  fcp?: number;
  cls?: number;
  ttfb?: number;
}

async function collectWebVitals(page: Page): Promise<Partial<PerfMetrics>> {
  return await page.evaluate(() => {
    return new Promise<Partial<PerfMetrics>>((resolve) => {
      const metrics: Partial<PerfMetrics> = {};
      
      // Get navigation timing
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        metrics.ttfb = nav.responseStart - nav.requestStart;
        metrics.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
        metrics.loadComplete = nav.loadEventEnd - nav.startTime;
      }
      
      // Get paint timings
      const paints = performance.getEntriesByType('paint');
      for (const paint of paints) {
        if (paint.name === 'first-contentful-paint') {
          metrics.fcp = paint.startTime;
        }
      }
      
      // Try to get LCP (may not be available immediately)
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        const lastLcp = lcpEntries[lcpEntries.length - 1] as PerformanceEntry & { startTime: number };
        metrics.lcp = lastLcp.startTime;
      }
      
      // CLS requires PerformanceObserver - simplified version
      let clsValue = 0;
      const clsEntries = performance.getEntriesByType('layout-shift') as (PerformanceEntry & { value: number; hadRecentInput: boolean })[];
      for (const entry of clsEntries) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      metrics.cls = clsValue;
      
      resolve(metrics);
    });
  });
}

async function measureNavigation(page: Page, url: string, label: string): Promise<PerfMetrics> {
  const startTime = Date.now();
  
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Wait a bit for LCP to stabilize
  await page.waitForTimeout(1000);
  
  const vitals = await collectWebVitals(page);
  
  const metrics: PerfMetrics = {
    url,
    navigationStart: startTime,
    domContentLoaded: vitals.domContentLoaded || 0,
    loadComplete: vitals.loadComplete || 0,
    lcp: vitals.lcp,
    fcp: vitals.fcp,
    cls: vitals.cls,
    ttfb: vitals.ttfb,
  };
  
  console.log(`[perf] ${label}: LCP=${metrics.lcp?.toFixed(0)}ms, FCP=${metrics.fcp?.toFixed(0)}ms, CLS=${metrics.cls?.toFixed(3)}`);
  
  return metrics;
}

// ============================================================================
// PUBLIC PAGE PERFORMANCE TESTS
// ============================================================================

test.describe('Performance: Public Pages @perf', () => {
  test('Home page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/', 'Home');
    
    // Assertions based on performance budgets
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
    expect(metrics.fcp, 'FCP should be under 1.8s').toBeLessThan(1800);
    expect(metrics.cls, 'CLS should be under 0.1').toBeLessThan(0.1);
  });
  
  test('Login page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/login', 'Login');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
    expect(metrics.fcp, 'FCP should be under 1.8s').toBeLessThan(1800);
  });
  
  test('Features page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/features', 'Features');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
  });
});

// ============================================================================
// AUTHENTICATED PAGE PERFORMANCE TESTS
// ============================================================================

test.describe('Performance: Authenticated Pages @perf', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"], input[type="email"]', PERF_USER.email);
    await page.fill('input[name="password"], input[type="password"]', PERF_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect
    await page.waitForURL(/\/(discovery|me|$)/, { timeout: 10000 });
  });
  
  test('Discovery page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/discovery', 'Discovery');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
    expect(metrics.fcp, 'FCP should be under 1.8s').toBeLessThan(1800);
  });
  
  test('Chat list page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/chat', 'Chat');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
  });
  
  test('Profile page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/me', 'Profile');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
    expect(metrics.cls, 'CLS should be under 0.1').toBeLessThan(0.1);
  });
  
  test('Meetups page loads within budget', async ({ page }) => {
    const metrics = await measureNavigation(page, '/meetups', 'Meetups');
    
    expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
  });
});

// ============================================================================
// USER JOURNEY PERFORMANCE TESTS
// ============================================================================

test.describe('Performance: User Journeys @perf', () => {
  test('Login → Discovery → Profile flow', async ({ page }) => {
    const results: PerfMetrics[] = [];
    
    // Step 1: Start at login
    results.push(await measureNavigation(page, '/login', 'Journey: Login'));
    
    // Step 2: Perform login
    await page.fill('input[name="email"], input[type="email"]', PERF_USER.email);
    await page.fill('input[name="password"], input[type="password"]', PERF_USER.password);
    
    const loginStart = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(discovery|me|$)/, { timeout: 10000 });
    const loginDuration = Date.now() - loginStart;
    console.log(`[perf] Login action: ${loginDuration}ms`);
    
    // Step 3: Navigate to discovery (may already be there)
    results.push(await measureNavigation(page, '/discovery', 'Journey: Discovery'));
    
    // Step 4: Navigate to profile
    results.push(await measureNavigation(page, '/me', 'Journey: Profile'));
    
    // Step 5: Navigate back to discovery (should be faster - cached)
    results.push(await measureNavigation(page, '/discovery', 'Journey: Discovery (cached)'));
    
    // Journey assertions
    expect(loginDuration, 'Login should complete in 3s').toBeLessThan(3000);
    
    // The cached navigation should be faster
    const firstDiscovery = results.find(r => r.url === '/discovery');
    const cachedDiscovery = results.filter(r => r.url === '/discovery').pop();
    if (firstDiscovery && cachedDiscovery && firstDiscovery !== cachedDiscovery) {
      console.log(`[perf] Cache effect: ${firstDiscovery.loadComplete}ms → ${cachedDiscovery.loadComplete}ms`);
    }
  });
  
  test('Browse and interact flow (cold start)', async ({ page }) => {
    // This tests the experience of a new user browsing public pages
    const results: PerfMetrics[] = [];
    
    // Cold start: home page
    results.push(await measureNavigation(page, '/', 'Browse: Home'));
    
    // Check out features
    results.push(await measureNavigation(page, '/features', 'Browse: Features'));
    
    // Navigate to login
    results.push(await measureNavigation(page, '/login', 'Browse: Login'));
    
    // Back to home (client-side navigation should be faster)
    results.push(await measureNavigation(page, '/', 'Browse: Home (return)'));
    
    // All pages should meet budget
    for (const metrics of results) {
      expect(metrics.lcp, `${metrics.url} LCP budget`).toBeLessThan(3000); // Slightly relaxed for journey
    }
  });
});

// ============================================================================
// SETTINGS PAGES PERFORMANCE
// ============================================================================

test.describe('Performance: Settings Pages @perf', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"], input[type="email"]', PERF_USER.email);
    await page.fill('input[name="password"], input[type="password"]', PERF_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(discovery|me|$)/, { timeout: 10000 });
  });
  
  const settingsPages = [
    '/settings/profile',
    '/settings/privacy',
    '/settings/notifications',
    '/settings/security',
  ];
  
  for (const settingsPage of settingsPages) {
    test(`${settingsPage} loads within budget`, async ({ page }) => {
      const metrics = await measureNavigation(page, settingsPage, `Settings: ${settingsPage}`);
      
      expect(metrics.lcp, 'LCP should be under 2.5s').toBeLessThan(2500);
      expect(metrics.cls, 'CLS should be under 0.1').toBeLessThan(0.1);
    });
  }
});
