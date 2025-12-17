#!/usr/bin/env node
/**
 * Performance Report Generator
 *
 * Aggregates Lighthouse JSON reports created by `scripts/perf-lighthouse-batch.js`
 * and writes:
 *  - perf-results/PERFORMANCE_REPORT.json
 *  - perf-results/PERFORMANCE_REPORT.txt
 */

const fs = require('fs');
const path = require('path');

const PERF_RESULTS_DIR = path.join(__dirname, '../perf-results');

function die(message) {
  console.error(`[perf] ❌ ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[perf] ${message}`);
}

function listReportFiles() {
  if (!fs.existsSync(PERF_RESULTS_DIR)) return [];
  return fs
    .readdirSync(PERF_RESULTS_DIR)
    .filter(f => /^lighthouse-prod-(desktop|mobile)-.+\.report\.json$/i.test(f))
    .map(f => path.join(PERF_RESULTS_DIR, f));
}

function statusFromThreshold(value, good, warn) {
  if (value == null || Number.isNaN(value)) return 'unknown';
  if (value <= good) return 'good';
  if (value <= warn) return 'needs-improvement';
  return 'poor';
}

function asScore(score01) {
  if (typeof score01 !== 'number') return null;
  return Math.round(score01 * 100);
}

function extractMetrics(lhr) {
  const metrics = lhr?.audits?.metrics?.details?.items?.[0] || {};

  const lcp = metrics.largestContentfulPaint;
  const fcp = metrics.firstContentfulPaint;
  const cls = metrics.cumulativeLayoutShift;
  const tbt = metrics.totalBlockingTime;

  return {
    lcp,
    fcp,
    cls,
    tbt,
    tti: metrics.interactive,
    speedIndex: metrics.speedIndex,
  };
}

function derivePresetFromFilename(filePath) {
  const base = path.basename(filePath);
  const m = base.match(/^lighthouse-prod-(desktop|mobile)-/i);
  return m ? m[1].toLowerCase() : 'unknown';
}

function main() {
  const budgets = {
    LCP: { target: 2500, warning: 4000 },
    FCP: { target: 1800, warning: 3000 },
    CLS: { target: 0.1, warning: 0.25 },
    TBT: { target: 200, warning: 600 },
    performanceScore: { target: 90, warning: 50 },
  };

  const files = listReportFiles();
  if (files.length === 0) {
    die('No Lighthouse production reports found (expected files like lighthouse-prod-desktop-*.report.json).');
  }

  const report = {
    title: 'uniHood Performance Report',
    generated: new Date().toISOString(),
    environment: {
      mode: 'production',
      tool: 'Lighthouse (via npx)',
    },
    budgets,
    results: [],
  };

  for (const filePath of files) {
    const lhr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const requestedUrl = lhr.requestedUrl;
    const finalUrl = lhr.finalDisplayedUrl || requestedUrl;
    if (!requestedUrl || String(requestedUrl).startsWith('chrome-error://')) continue;
    if (!finalUrl || String(finalUrl).startsWith('chrome-error://')) continue;

    const preset = derivePresetFromFilename(filePath);
    const metrics = extractMetrics(lhr);

    const perf = asScore(lhr?.categories?.performance?.score);
    const acc = asScore(lhr?.categories?.accessibility?.score);
    const bp = asScore(lhr?.categories?.['best-practices']?.score);
    const seo = asScore(lhr?.categories?.seo?.score);

    report.results.push({
      page: new URL(requestedUrl).pathname,
      preset,
      requestedUrl,
      finalUrl,
      url: finalUrl,
      scores: {
        performance: perf,
        accessibility: acc,
        bestPractices: bp,
        seo,
      },
      coreWebVitals: {
        LCP: { value: metrics.lcp, unit: 'ms', status: statusFromThreshold(metrics.lcp, budgets.LCP.target, budgets.LCP.warning) },
        FCP: { value: metrics.fcp, unit: 'ms', status: statusFromThreshold(metrics.fcp, budgets.FCP.target, budgets.FCP.warning) },
        CLS: { value: typeof metrics.cls === 'number' ? Number(metrics.cls.toFixed(3)) : metrics.cls, unit: '', status: statusFromThreshold(metrics.cls, budgets.CLS.target, budgets.CLS.warning) },
        TBT: { value: metrics.tbt, unit: 'ms', status: statusFromThreshold(metrics.tbt, budgets.TBT.target, budgets.TBT.warning) },
      },
      timing: {
        TTI: metrics.tti,
        SpeedIndex: metrics.speedIndex,
      },
      source: {
        reportFile: path.basename(filePath),
      },
    });
  }

  // Sort results for stable output: preset then page
  report.results.sort((a, b) => {
    if (a.preset !== b.preset) return a.preset.localeCompare(b.preset);
    return a.page.localeCompare(b.page);
  });

  const jsonOut = path.join(PERF_RESULTS_DIR, 'PERFORMANCE_REPORT.json');
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));

  // Text report
  let txt = '';
  txt += '\n';
  txt += '           uniHood Performance Report                             \n';
  txt += '\n';
  txt += ' Generated: ' + report.generated.padEnd(53) + '\n';
  txt += ' Environment: Production (Desktop + Mobile presets)               \n';
  txt += '\n\n';

  for (const r of report.results) {
    txt += `${r.page}  [${r.preset}]\n`;
    txt += `Requested: ${String(r.requestedUrl).substring(0, 62)}\n`;
    if (r.finalUrl && r.finalUrl !== r.requestedUrl) {
      txt += `Final:     ${String(r.finalUrl).substring(0, 62)}\n`;
    }
    txt += '\n';

    txt += ' SCORES\n';
    txt += `   Performance: ${String(r.scores.performance ?? 'n/a').padEnd(4)} Accessibility: ${String(r.scores.accessibility ?? 'n/a').padEnd(4)} SEO: ${String(r.scores.seo ?? 'n/a').padEnd(4)}\n\n`;

    txt += ' CORE WEB VITALS\n';
    txt += `   LCP: ${String((r.coreWebVitals.LCP.value ?? 'n/a') + 'ms').padEnd(10)} [${r.coreWebVitals.LCP.status.padEnd(16)}] (target: <2500ms)\n`;
    txt += `   FCP: ${String((r.coreWebVitals.FCP.value ?? 'n/a') + 'ms').padEnd(10)} [${r.coreWebVitals.FCP.status.padEnd(16)}] (target: <1800ms)\n`;
    txt += `   CLS: ${String(r.coreWebVitals.CLS.value ?? 'n/a').padEnd(10)} [${r.coreWebVitals.CLS.status.padEnd(16)}] (target: <0.1)\n`;
    txt += `   TBT: ${String((r.coreWebVitals.TBT.value ?? 'n/a') + 'ms').padEnd(10)} [${r.coreWebVitals.TBT.status.padEnd(16)}] (target: <200ms)\n\n`;

    txt += ' TIMING\n';
    txt += `   Time to Interactive: ${r.timing.TTI ?? 'n/a'}ms\n`;
    txt += `   Speed Index: ${r.timing.SpeedIndex ?? 'n/a'}ms\n`;
    txt += '\n\n';
  }

  txt += 'Budget Thresholds:\n';
  txt += '  LCP  < 2500ms (good), < 4000ms (needs improvement)\n';
  txt += '  FCP  < 1800ms (good), < 3000ms (needs improvement)\n';
  txt += '  CLS  < 0.1 (good), < 0.25 (needs improvement)\n';
  txt += '  TBT  < 200ms (good), < 600ms (needs improvement)\n';
  txt += '  Perf Score >= 90 (good), >= 50 (needs improvement)\n';
  txt += '\n';

  const txtOut = path.join(PERF_RESULTS_DIR, 'PERFORMANCE_REPORT.txt');
  fs.writeFileSync(txtOut, txt);

  info(`Wrote: ${jsonOut}`);
  info(`Wrote: ${txtOut}`);
  info(`Included reports: ${report.results.length}`);
}

main();
