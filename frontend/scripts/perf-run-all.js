#!/usr/bin/env node
/**
 * Performance Test Runner
 * 
 * Orchestrates full performance measurement across all pages:
 * 1. Generates page inventory from Next.js manifests
 * 2. Runs Lighthouse CI on public pages (no auth needed)
 * 3. Runs Lighthouse CI on authenticated pages (requires session)
 * 4. Aggregates results into a summary report
 * 
 * Usage:
 *   npm run perf:all           # Full run (public + auth)
 *   npm run perf:all:public    # Public pages only
 *   npm run perf:all:smoke     # Quick smoke test (top 5 pages)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  baseUrl: process.env.PERF_BASE_URL || 'http://localhost:3000',
  outputDir: path.join(__dirname, '../perf-results'),
  
  // Number of Lighthouse runs per URL (more runs = more stable results)
  numberOfRuns: parseInt(process.env.PERF_RUNS || '3', 10),
  
  // Lighthouse presets to run
  presets: ['mobile', 'desktop'],
  
  // Smoke test: only test these critical pages
  smokeTestPages: [
    '/',
    '/login',
    '/discovery',
    '/chat',
    '/meetups',
  ],
  
  // Budget thresholds (from lighthouserc.js)
  budgets: {
    performance: 0.9,
    lcp: 2500,
    cls: 0.1,
    tbt: 200,
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function log(msg) {
  console.log(`[perf] ${msg}`);
}

function logError(msg) {
  console.error(`[perf] ❌ ${msg}`);
}

function runCommand(cmd, options = {}) {
  log(`Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (err) {
    logError(`Command failed: ${cmd}`);
    return false;
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getAuditNumericValue(lhr, auditId) {
  const audit = lhr?.audits?.[auditId];
  if (!audit || typeof audit.numericValue !== 'number') return null;
  return audit.numericValue;
}

function summarizeLhciOutput(outputPath) {
  const manifestPath = path.join(outputPath, 'manifest.json');
  const manifest = safeReadJson(manifestPath);
  if (!Array.isArray(manifest) || manifest.length === 0) return null;

  const rows = [];
  for (const entry of manifest) {
    const jsonPath = entry?.jsonPath;
    const url = entry?.url;
    if (!jsonPath || !url) continue;

    const report = safeReadJson(jsonPath);
    const lhr = report?.lhr || report;
    const performanceScore = typeof lhr?.categories?.performance?.score === 'number'
      ? lhr.categories.performance.score
      : null;

    rows.push({
      url,
      performanceScore,
      lcp: getAuditNumericValue(lhr, 'largest-contentful-paint'),
      fcp: getAuditNumericValue(lhr, 'first-contentful-paint'),
      cls: getAuditNumericValue(lhr, 'cumulative-layout-shift'),
      tbt: getAuditNumericValue(lhr, 'total-blocking-time'),
      ttfb: getAuditNumericValue(lhr, 'server-response-time'),
    });
  }

  if (rows.length === 0) return null;

  const byUrl = new Map();
  for (const row of rows) {
    if (!byUrl.has(row.url)) byUrl.set(row.url, []);
    byUrl.get(row.url).push(row);
  }

  function average(values) {
    const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  const perUrl = Array.from(byUrl.entries()).map(([url, urlRows]) => {
    return {
      url,
      runs: urlRows.length,
      avg: {
        performanceScore: average(urlRows.map((r) => r.performanceScore)),
        lcp: average(urlRows.map((r) => r.lcp)),
        fcp: average(urlRows.map((r) => r.fcp)),
        cls: average(urlRows.map((r) => r.cls)),
        tbt: average(urlRows.map((r) => r.tbt)),
        ttfb: average(urlRows.map((r) => r.ttfb)),
      },
    };
  });

  const overall = {
    urls: perUrl.length,
    avg: {
      performanceScore: average(perUrl.map((r) => r.avg.performanceScore)),
      lcp: average(perUrl.map((r) => r.avg.lcp)),
      fcp: average(perUrl.map((r) => r.avg.fcp)),
      cls: average(perUrl.map((r) => r.avg.cls)),
      tbt: average(perUrl.map((r) => r.avg.tbt)),
      ttfb: average(perUrl.map((r) => r.avg.ttfb)),
    },
  };

  const worstByTbt = [...perUrl]
    .filter((r) => typeof r.avg.tbt === 'number')
    .sort((a, b) => b.avg.tbt - a.avg.tbt)
    .slice(0, 5);

  const worstByLcp = [...perUrl]
    .filter((r) => typeof r.avg.lcp === 'number')
    .sort((a, b) => b.avg.lcp - a.avg.lcp)
    .slice(0, 5);

  return { overall, perUrl, worstByTbt, worstByLcp };
}

async function probeServer(baseUrl) {
  const http = require('http');
  const url = new URL(baseUrl);
  const isLocalhost = url.hostname === 'localhost';

  return await new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname || '/',
        protocol: url.protocol,
        timeout: 5000,
        // On Windows, localhost may resolve to IPv6 (::1) while the server only listens on IPv4.
        ...(isLocalhost ? { family: 4 } : {}),
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function findReachableBaseUrl(initialBaseUrl) {
  const url = new URL(initialBaseUrl);
  const candidates = [initialBaseUrl];

  // Common Windows / localhost resolution pitfall
  if (url.hostname === 'localhost') {
    const ipv4Local = new URL(initialBaseUrl);
    ipv4Local.hostname = '127.0.0.1';
    candidates.push(ipv4Local.toString().replace(/\/$/, ''));
  }

  // If user expects 3000 but Next moved to 3001, try that too.
  const portNum = parseInt(url.port || '0', 10);
  if (!Number.isNaN(portNum) && portNum === 3000) {
    const portFallback = new URL(initialBaseUrl);
    portFallback.port = '3001';
    candidates.push(portFallback.toString().replace(/\/$/, ''));

    if (url.hostname === 'localhost') {
      const portFallbackIpv4 = new URL(portFallback.toString());
      portFallbackIpv4.hostname = '127.0.0.1';
      candidates.push(portFallbackIpv4.toString().replace(/\/$/, ''));
    }
  }

  for (const candidate of candidates) {
    try {
      await probeServer(candidate);
      return candidate.replace(/\/$/, '');
    } catch {
      // try next candidate
    }
  }

  return null;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

async function generateInventory() {
  log('Generating page inventory...');
  const inventoryScript = path.join(__dirname, 'perf-inventory.js');
  runCommand(`node "${inventoryScript}"`);
  
  const inventoryPath = path.join(CONFIG.outputDir, 'page-inventory.json');
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
}

async function runLighthousePublic(inventory) {
  log('Running Lighthouse on public pages...');
  
  const publicPages = inventory.pages.filter(p => !p.requiresAuth);
  const urls = publicPages.map(p => `${CONFIG.baseUrl}${p.url}`);
  
  if (urls.length === 0) {
    log('No public pages to test');
    return;
  }
  
  log(`Testing ${urls.length} public pages...`);
  
  // Write URLs to temp file for LHCI
  const urlsFile = path.join(CONFIG.outputDir, 'lhci-urls-public.txt');
  fs.writeFileSync(urlsFile, urls.join('\n'));
  
  // Run Lighthouse CI
  const outputPath = path.join(CONFIG.outputDir, `lighthouse-public-${timestamp()}`);
  ensureDir(outputPath);

  // LHCI expects multiple --collect.url flags, not a comma-separated list.
  const urlArgs = urls.map((u) => `--collect.url="${u}"`).join(' ');
  
  // Use custom config that reads from our URL file
  const success = runCommand(
    `npx lhci autorun ` +
    `--config=./scripts/lhci.perf-runner.config.cjs ` +
    `${urlArgs} ` +
    `--collect.numberOfRuns=${CONFIG.numberOfRuns} ` +
    `--upload.target=filesystem ` +
    `--upload.outputDir="${outputPath}"`,
    { cwd: path.join(__dirname, '..') }
  );

  const lhciSummary = success ? summarizeLhciOutput(outputPath) : null;
  if (lhciSummary) {
    const summaryPath = path.join(CONFIG.outputDir, `lhci-summary-public-${timestamp()}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(lhciSummary, null, 2));
    log(`LHCI KPI summary: ${summaryPath}`);

    if (lhciSummary.worstByTbt?.length) {
      log('Worst pages by avg TBT (ms):');
      for (const row of lhciSummary.worstByTbt) {
        log(`  ${Math.round(row.avg.tbt)}ms  ${row.url}`);
      }
    }
  }

  return { success, outputPath, pageCount: urls.length, lhciSummary: lhciSummary || undefined };
}

async function runSmokeTest() {
  log('Running smoke test (critical pages only)...');
  
  const urls = CONFIG.smokeTestPages.map(p => `${CONFIG.baseUrl}${p}`);
  const outputPath = path.join(CONFIG.outputDir, `lighthouse-smoke-${timestamp()}`);
  ensureDir(outputPath);

  const urlArgs = urls.map((u) => `--collect.url="${u}"`).join(' ');
  
  const success = runCommand(
    `npx lhci autorun ` +
    `--config=./scripts/lhci.perf-runner.config.cjs ` +
    `${urlArgs} ` +
    `--collect.numberOfRuns=1 ` +
    `--upload.target=filesystem ` +
    `--upload.outputDir="${outputPath}"`,
    { cwd: path.join(__dirname, '..') }
  );
  
  return { success, outputPath, pageCount: urls.length };
}

function generateSummaryReport(inventory, results) {
  const report = {
    generated: new Date().toISOString(),
    config: CONFIG,
    inventory: {
      total: inventory.summary.total,
      byCategory: inventory.summary.byCategory,
    },
    runs: results,
    recommendations: [],
  };
  
  // Add recommendations based on inventory
  if (inventory.summary.byAuth.authenticated > 20) {
    report.recommendations.push(
      'Consider splitting authenticated page tests into batches for CI efficiency'
    );
  }
  
  if (inventory.summary.dynamic > 10) {
    report.recommendations.push(
      'Ensure PERF_TEST_DATA IDs in perf-inventory.js match your seeded database'
    );
  }
  
  const reportPath = path.join(CONFIG.outputDir, `perf-summary-${timestamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Summary report: ${reportPath}`);
  
  return report;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'public'; // public, smoke, full
  
  ensureDir(CONFIG.outputDir);
  
  console.log('\n🚀 Divan Performance Test Runner\n');
  console.log(`Mode: ${mode}`);
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Runs per URL: ${CONFIG.numberOfRuns}`);
  console.log('');
  
  // Check if server is running
  const reachableBaseUrl = await findReachableBaseUrl(CONFIG.baseUrl);
  if (!reachableBaseUrl) {
    logError(`Server not reachable at ${CONFIG.baseUrl}`);
    logError('Start the server first: npm run build && npm start');
    process.exit(1);
  }
  if (reachableBaseUrl !== CONFIG.baseUrl) {
    log(`Detected reachable server at ${reachableBaseUrl} (was ${CONFIG.baseUrl})`);
    CONFIG.baseUrl = reachableBaseUrl;
  }
  
  const results = [];
  
  // Generate inventory
  const inventory = await generateInventory();
  log(`Found ${inventory.summary.total} pages`);
  
  if (mode === 'smoke') {
    // Quick smoke test
    const result = await runSmokeTest();
    results.push({ type: 'smoke', ...result });
  } else if (mode === 'public') {
    // Public pages only
    const result = await runLighthousePublic(inventory);
    results.push({ type: 'public', ...result });
  } else if (mode === 'full') {
    // Public pages
    const publicResult = await runLighthousePublic(inventory);
    results.push({ type: 'public', ...publicResult });
    
    // Note: Authenticated pages require session handling
    log('⚠️  Authenticated page testing requires Playwright integration');
    log('   See: frontend/e2e/perf-authenticated.spec.ts (to be created)');
  }
  
  // Generate summary
  const summary = generateSummaryReport(inventory, results);
  
  console.log('\n✅ Performance test complete\n');
  console.log('Results:');
  for (const r of results) {
    console.log(`  ${r.type}: ${r.pageCount} pages → ${r.outputPath}`);
  }
  console.log('');
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});
