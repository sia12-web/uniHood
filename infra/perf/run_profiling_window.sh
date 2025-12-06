#!/usr/bin/env bash
# =============================================================================
# Divan Performance Profiling Window Script
# =============================================================================
#
# Runs a controlled profiling session with full sampling enabled to collect
# rich traces and RUM data for baseline analysis.
#
# Usage:
#   ./run_profiling_window.sh [DURATION_MINS] [ENV]
#   ./run_profiling_window.sh 30 local
#   ./run_profiling_window.sh 60 staging
#
# Prerequisites:
#   - k6 installed (https://k6.io/docs/getting-started/installation/)
#   - lighthouse installed (npm install -g lighthouse)
#   - Access to staging environment or local docker-compose
#
# =============================================================================

set -euo pipefail

# Configuration
DURATION_MINS="${1:-30}"
ENV="${2:-local}"
TS=$(date -u +"%Y%m%dT%H%MZ")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTDIR="${PROJECT_ROOT}/perf-results/${TS}-profiling"

# URLs based on environment
case "$ENV" in
  staging)
    BACKEND_URL="${K6_BACKEND_URL:-https://staging.divan.example}"
    FRONTEND_URL="${FRONTEND_URL:-https://staging.divan.example}"
    ;;
  local)
    BACKEND_URL="${K6_BACKEND_URL:-http://localhost:8000}"
    FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
    ;;
  *)
    echo "Unknown environment: $ENV (use 'staging' or 'local')"
    exit 1
    ;;
esac

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Setup
# =============================================================================

mkdir -p "$OUTDIR"/{k6,lighthouse,traces,grafana,prometheus,rum}

echo ""
echo -e "${MAGENTA}==============================================================================${NC}"
echo -e "${MAGENTA}  Divan Performance Profiling Session${NC}"
echo -e "${MAGENTA}==============================================================================${NC}"
echo ""
log_info "Timestamp:    $TS"
log_info "Duration:     ${DURATION_MINS} minutes"
log_info "Environment:  $ENV"
log_info "Backend URL:  $BACKEND_URL"
log_info "Frontend URL: $FRONTEND_URL"
log_info "Output:       $OUTDIR"
echo ""

# =============================================================================
# Phase 1: Enable Debug Environment
# =============================================================================

enable_debug_env() {
  echo ""
  log_info "Phase 1: Enabling debug environment..."
  
  export PERF_TRACE_LABELS=true
  export PERF_DEBUG_MODE=true
  export RUM_SAMPLE_RATE=1.0
  export TRACE_SAMPLE_RATE=1.0
  export K6_VERBOSE=true
  
  log_info "  PERF_TRACE_LABELS = true"
  log_info "  PERF_DEBUG_MODE = true"
  log_info "  RUM_SAMPLE_RATE = 1.0"
  log_info "  TRACE_SAMPLE_RATE = 1.0"
  
  if [ "$ENV" = "local" ]; then
    if [ -f "${PROJECT_ROOT}/docker-compose.yml" ]; then
      log_info "Restarting docker-compose with debug env..."
      cd "$PROJECT_ROOT"
      docker-compose up -d --force-recreate backend 2>/dev/null || log_warn "docker-compose restart skipped"
      log_info "Waiting 15s for services to stabilize..."
      sleep 15
    fi
  else
    if [ -f "${SCRIPT_DIR}/k8s/patch-staging-debug.yaml" ]; then
      log_info "Applying Kubernetes debug patch..."
      kubectl apply -f "${SCRIPT_DIR}/k8s/patch-staging-debug.yaml" 2>/dev/null || log_warn "kubectl patch skipped"
      log_info "Waiting 60s for pods to roll..."
      sleep 60
    else
      log_warn "No k8s patch file found. Set env vars manually."
    fi
  fi
  
  log_success "Debug environment enabled"
}

# =============================================================================
# Phase 2: Run K6 Load Tests
# =============================================================================

run_k6_tests() {
  echo ""
  log_info "Phase 2: Running K6 load tests..."
  
  local k6_dir="${PROJECT_ROOT}/infra/k6"
  local k6_output="${OUTDIR}/k6"
  
  if ! command -v k6 &> /dev/null; then
    log_warn "k6 not found. Install from https://k6.io/docs/getting-started/installation/"
    return
  fi
  
  # Define tests
  declare -a tests=(
    "api_smoke:api_load_test.js:smoke"
    "api_load:api_load_test.js:load"
    "chat_load:chat_send_load.js:load"
    "proximity_load:proximity_nearby_load.js:load"
  )
  
  for test_spec in "${tests[@]}"; do
    IFS=':' read -r test_name test_file test_profile <<< "$test_spec"
    local test_path="${k6_dir}/${test_file}"
    
    if [ ! -f "$test_path" ]; then
      log_warn "Test file not found: $test_path"
      continue
    fi
    
    log_info "  Running ${test_name}..."
    local run_id="${TS}-${test_name}"
    
    K6_RUN_ID="$run_id" \
    K6_PROFILE="$test_profile" \
    k6 run \
      -e "K6_BACKEND_URL=$BACKEND_URL" \
      -e "K6_PROFILE=$test_profile" \
      -e "K6_RUN_ID=$run_id" \
      --out "json=${k6_output}/${test_name}.json" \
      "$test_path" 2>&1 | tee "${k6_output}/${test_name}.txt" || log_warn "  ${test_name} had issues"
    
    log_success "    ${test_name} complete"
  done
  
  log_success "K6 tests complete. Results in ${k6_output}"
}

# =============================================================================
# Phase 3: Run Lighthouse Audits
# =============================================================================

run_lighthouse() {
  echo ""
  log_info "Phase 3: Running Lighthouse audits..."
  
  local lh_output="${OUTDIR}/lighthouse"
  
  if ! command -v lighthouse &> /dev/null; then
    log_warn "lighthouse not found. Install with: npm install -g lighthouse"
    return
  fi
  
  declare -a pages=(
    "home:/"
    "login:/login"
    "discover:/discover"
  )
  
  for page_spec in "${pages[@]}"; do
    IFS=':' read -r page_name page_path <<< "$page_spec"
    local url="${FRONTEND_URL}${page_path}"
    local output_path="${lh_output}/${page_name}"
    
    log_info "  Auditing ${page_name} page..."
    
    lighthouse "$url" \
      --output=json,html \
      --output-path="$output_path" \
      --chrome-flags="--headless --no-sandbox --disable-gpu" \
      --preset=desktop \
      --quiet 2>&1 || log_warn "  ${page_name} audit had issues"
    
    log_success "    ${page_name} audit complete"
  done
  
  log_success "Lighthouse audits complete. Results in ${lh_output}"
}

# =============================================================================
# Phase 4: Collect Prometheus Metrics
# =============================================================================

collect_metrics() {
  echo ""
  log_info "Phase 4: Collecting Prometheus metrics..."
  
  local prom_url="${PROMETHEUS_URL:-http://localhost:9090}"
  local prom_output="${OUTDIR}/prometheus"
  
  declare -a queries=(
    "http_p95_by_endpoint:histogram_quantile(0.95,sum(rate(divan_http_request_duration_seconds_bucket[5m]))by(le,endpoint))"
    "http_p99_by_endpoint:histogram_quantile(0.99,sum(rate(divan_http_request_duration_seconds_bucket[5m]))by(le,endpoint))"
    "error_rates:sum(rate(divan_http_requests_total{status=~\"5..\"}[5m]))by(endpoint)/sum(rate(divan_http_requests_total[5m]))by(endpoint)"
    "request_rate:sum(rate(divan_http_requests_total[5m]))by(endpoint)"
    "sampled_requests:sum(rate(divan_sampled_requests_total[5m]))by(endpoint)"
    "active_requests:divan_http_active_requests"
    "db_query_p95:histogram_quantile(0.95,sum(rate(divan_db_query_duration_seconds_bucket[5m]))by(le,operation))"
  )
  
  for query_spec in "${queries[@]}"; do
    IFS=':' read -r query_name query <<< "$query_spec"
    local output_file="${prom_output}/${query_name}.json"
    local encoded_query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))" 2>/dev/null || echo "$query")
    
    log_info "  Querying ${query_name}..."
    
    curl -s "${prom_url}/api/v1/query?query=${encoded_query}" \
      > "$output_file" 2>/dev/null && log_success "    ${query_name} collected" || log_warn "    ${query_name} failed"
  done
  
  log_success "Metrics collected in ${prom_output}"
}

# =============================================================================
# Phase 5: Collect Traces
# =============================================================================

collect_traces() {
  echo ""
  log_info "Phase 5: Collecting traces..."
  
  local jaeger_url="${JAEGER_URL:-http://localhost:16686}"
  local traces_output="${OUTDIR}/traces"
  
  for run_type in smoke load chat proximity; do
    local run_id="${TS}-${run_type}"
    local output_file="${traces_output}/${run_type}_traces.json"
    
    log_info "  Fetching traces for run: $run_id"
    
    curl -s "${jaeger_url}/api/traces?service=divan-backend&limit=100" \
      > "$output_file" 2>/dev/null && log_success "    ${run_type} traces collected" || log_warn "    ${run_type} traces failed"
  done
  
  log_success "Traces collected in ${traces_output}"
}

# =============================================================================
# Phase 6: Generate Report
# =============================================================================

generate_report() {
  echo ""
  log_info "Phase 6: Generating summary report..."
  
  cat > "${OUTDIR}/REPORT.md" << EOF
# Divan Performance Profiling Report

**Session:** ${TS}  
**Environment:** ${ENV}  
**Duration:** ${DURATION_MINS} minutes  
**Backend URL:** ${BACKEND_URL}  
**Frontend URL:** ${FRONTEND_URL}  

---

## Artifacts

### K6 Load Test Results
| Test | Output | JSON |
|------|--------|------|
| API Smoke | \`k6/api_smoke.txt\` | \`k6/api_smoke.json\` |
| API Load | \`k6/api_load.txt\` | \`k6/api_load.json\` |
| Chat Load | \`k6/chat_load.txt\` | \`k6/chat_load.json\` |
| Proximity Load | \`k6/proximity_load.txt\` | \`k6/proximity_load.json\` |

### Lighthouse Audits
| Page | HTML Report | JSON Data |
|------|-------------|-----------|
| Home | \`lighthouse/home.report.html\` | \`lighthouse/home.report.json\` |
| Login | \`lighthouse/login.report.html\` | \`lighthouse/login.report.json\` |
| Discover | \`lighthouse/discover.report.html\` | \`lighthouse/discover.report.json\` |

### Prometheus Metrics
- \`prometheus/http_p95_by_endpoint.json\` - P95 latency by endpoint
- \`prometheus/http_p99_by_endpoint.json\` - P99 latency by endpoint
- \`prometheus/error_rates.json\` - Error rates by endpoint
- \`prometheus/request_rate.json\` - Request rate by endpoint
- \`prometheus/db_query_p95.json\` - Database query P95

### Traces
- \`traces/*_traces.json\` - Distributed traces by test run

---

## Quick Analysis Checklist

### Backend Performance (Grafana: divan-tracing dashboard)

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| P95 latency (all endpoints) | < 150ms | [ ] | |
| P99 latency (all endpoints) | < 300ms | [ ] | |
| Error rate | < 1% | [ ] | |
| DB query P95 | < 50ms | [ ] | |
| Cache hit ratio | > 80% | [ ] | |

### Frontend Performance (Lighthouse reports)

| Metric | Target | Home | Login | Discover |
|--------|--------|------|-------|----------|
| Performance Score | > 90 | | | |
| LCP | < 2.5s | | | |
| FCP | < 1.8s | | | |
| TBT | < 200ms | | | |
| CLS | < 0.1 | | | |
| JS Bundle | < 500KB | | | |

---

## Hotspots Identified

| Rank | Endpoint/Module | Issue | Root Cause | Fix Complexity | Priority |
|------|-----------------|-------|------------|----------------|----------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

---

## Recommended Actions

### P1 - Quick Wins (< 1 day)
- [ ] 

### P2 - Medium Effort (1-3 days)
- [ ] 

### P3 - Large Effort (> 3 days)
- [ ] 

---

## Remediation Playbook Reference

| Finding | Typical Fix |
|---------|-------------|
| Slow DB queries | Add EXPLAIN ANALYZE, create indexes, implement batching |
| Low cache hits | Design cache keys, implement stale-while-revalidate |
| Heavy JS bundle | Code-split, lazy-load, replace heavy libraries |
| Image processing on request | Move to queue, serve from CDN |
| High GC / CPU | Profile heap, increase instance size, add workers |
| Connection exhaustion | Tune pool sizes, add pgbouncer |

---

*Generated by run_profiling_window.sh at $(date "+%Y-%m-%d %H:%M:%S")*
EOF

  log_success "Report generated: ${OUTDIR}/REPORT.md"
}

# =============================================================================
# Phase 7: Disable Debug Environment
# =============================================================================

disable_debug_env() {
  echo ""
  log_info "Phase 7: Disabling debug environment..."
  
  export PERF_TRACE_LABELS=false
  export PERF_DEBUG_MODE=false
  export RUM_SAMPLE_RATE=0.10
  export TRACE_SAMPLE_RATE=0.10
  unset K6_VERBOSE
  
  log_info "  PERF_TRACE_LABELS = false"
  log_info "  RUM_SAMPLE_RATE = 0.10"
  
  if [ "$ENV" = "local" ]; then
    if [ -f "${PROJECT_ROOT}/docker-compose.yml" ]; then
      log_info "Restarting docker-compose with normal env..."
      cd "$PROJECT_ROOT"
      docker-compose up -d --force-recreate backend 2>/dev/null || log_warn "docker-compose restart skipped"
    fi
  else
    if [ -f "${SCRIPT_DIR}/k8s/patch-staging-normal.yaml" ]; then
      log_info "Reverting Kubernetes to normal sampling..."
      kubectl apply -f "${SCRIPT_DIR}/k8s/patch-staging-normal.yaml" 2>/dev/null || log_warn "kubectl revert skipped"
    fi
  fi
  
  log_success "Debug environment disabled"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
  local start_time=$(date +%s)
  
  enable_debug_env
  run_k6_tests
  run_lighthouse
  collect_metrics
  collect_traces
  generate_report
  disable_debug_env
  
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  
  echo ""
  echo -e "${MAGENTA}==============================================================================${NC}"
  log_success "Profiling session complete!"
  echo -e "${MAGENTA}==============================================================================${NC}"
  log_info "Duration: $((duration / 60)) minutes $((duration % 60)) seconds"
  log_info "Artifacts: ${OUTDIR}"
  echo ""
  log_info "Next steps:"
  echo "  1. Open ${OUTDIR}/REPORT.md and fill in the analysis"
  echo "  2. Review Lighthouse HTML reports in ${OUTDIR}/lighthouse/"
  echo "  3. Import Grafana dashboard: infra/grafana/dashboards/divan-tracing.json"
  echo "  4. Query Prometheus with trace_id from slow requests"
  echo ""
}

# Cleanup on interrupt
trap 'log_error "Script interrupted. Running cleanup..."; disable_debug_env; exit 1' INT TERM

main "$@"
