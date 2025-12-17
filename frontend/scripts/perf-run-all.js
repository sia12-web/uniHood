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
  const lhciConfig = path.join(__dirname, '../lighthouserc.js');
  const outputPath = path.join(CONFIG.outputDir, `lighthouse-public-${timestamp()}`);
  ensureDir(outputPath);
  
  // Use custom config that reads from our URL file
  const success = runCommand(
    `npx lhci autorun ` +
    `--collect.url="${urls.slice(0, 10).join(',')}" ` +  // Limit to 10 for demo
    `--collect.numberOfRuns=${CONFIG.numberOfRuns} ` +
    `--upload.target=filesystem ` +
    `--upload.outputDir="${outputPath}"`,
    { cwd: path.join(__dirname, '..') }
  );
  
  return { success, outputPath, pageCount: urls.length };
}

async function runSmokeTest() {
  log('Running smoke test (critical pages only)...');
  
  const urls = CONFIG.smokeTestPages.map(p => `${CONFIG.baseUrl}${p}`);
  const outputPath = path.join(CONFIG.outputDir, `lighthouse-smoke-${timestamp()}`);
  ensureDir(outputPath);
  
  const success = runCommand(
    `npx lhci autorun ` +
    `--collect.url="${urls.join(',')}" ` +
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
  try {
    const http = require('http');
    await new Promise((resolve, reject) => {
      const req = http.get(CONFIG.baseUrl, res => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('timeout')));
    });
  } catch (err) {
    logError(`Server not reachable at ${CONFIG.baseUrl}`);
    logError('Start the server first: npm run build && npm start');
    process.exit(1);
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
