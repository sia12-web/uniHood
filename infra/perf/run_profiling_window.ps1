# =============================================================================
# Divan Performance Profiling Window Script (PowerShell)
# =============================================================================
#
# Runs a controlled profiling session with full sampling enabled to collect
# rich traces and RUM data for baseline analysis.
#
# Usage:
#   .\run_profiling_window.ps1 [-DurationMins 30] [-Env local|staging]
#
# Prerequisites:
#   - k6 installed (https://k6.io/docs/getting-started/installation/)
#   - lighthouse installed (npm install -g lighthouse)
#   - Docker running for local environment
#
# =============================================================================

param(
    [int]$DurationMins = 30,
    [ValidateSet("local", "staging")]
    [string]$Env = "local"
)

$ErrorActionPreference = "Continue"
$TS = Get-Date -Format "yyyyMMddTHHmmZ"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Get-Item "$ScriptDir\..\..").FullName
$OUTDIR = Join-Path $ProjectRoot "perf-results\$TS-profiling"

# URLs based on environment
switch ($Env) {
    "staging" {
        $BackendUrl = if ($env:K6_BACKEND_URL) { $env:K6_BACKEND_URL } else { "https://staging.divan.example" }
        $FrontendUrl = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "https://staging.divan.example" }
    }
    "local" {
        $BackendUrl = if ($env:K6_BACKEND_URL) { $env:K6_BACKEND_URL } else { "http://localhost:8000" }
        $FrontendUrl = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "http://localhost:3000" }
    }
}

# Logging functions
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# =============================================================================
# Setup
# =============================================================================

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Magenta
Write-Host "  Divan Performance Profiling Session" -ForegroundColor Magenta
Write-Host "==============================================================================" -ForegroundColor Magenta
Write-Host ""
Write-Info "Timestamp:    $TS"
Write-Info "Duration:     $DurationMins minutes"
Write-Info "Environment:  $Env"
Write-Info "Backend URL:  $BackendUrl"
Write-Info "Frontend URL: $FrontendUrl"
Write-Info "Output:       $OUTDIR"
Write-Host ""

# Create output directories
$dirs = @("k6", "lighthouse", "prometheus", "traces", "grafana", "rum")
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $OUTDIR $dir) | Out-Null
}

# =============================================================================
# Phase 1: Enable Debug Environment
# =============================================================================

function Enable-DebugEnv {
    Write-Host ""
    Write-Info "Phase 1: Enabling debug environment..."
    
    # Set environment variables for profiling
    $env:PERF_TRACE_LABELS = "true"
    $env:PERF_DEBUG_MODE = "true"
    $env:RUM_SAMPLE_RATE = "1.0"
    $env:TRACE_SAMPLE_RATE = "1.0"
    $env:K6_VERBOSE = "true"
    
    Write-Info "  PERF_TRACE_LABELS = true"
    Write-Info "  PERF_DEBUG_MODE = true"
    Write-Info "  RUM_SAMPLE_RATE = 1.0"
    Write-Info "  TRACE_SAMPLE_RATE = 1.0"
    
    if ($Env -eq "local") {
        $composeFile = Join-Path $ProjectRoot "docker-compose.yml"
        if (Test-Path $composeFile) {
            Write-Info "Restarting docker-compose with debug env..."
            Push-Location $ProjectRoot
            try {
                # Pass env vars to docker-compose
                docker-compose up -d --force-recreate backend 2>$null
                Write-Info "Waiting 15s for services to stabilize..."
                Start-Sleep -Seconds 15
            } catch {
                Write-Warn "docker-compose restart skipped: $_"
            }
            Pop-Location
        }
    } else {
        $patchFile = Join-Path $ScriptDir "k8s\patch-staging-debug.yaml"
        if (Test-Path $patchFile) {
            Write-Info "Applying Kubernetes debug patch..."
            try {
                kubectl apply -f $patchFile 2>$null
                Write-Info "Waiting 60s for pods to roll..."
                Start-Sleep -Seconds 60
            } catch {
                Write-Warn "kubectl patch skipped: $_"
            }
        } else {
            Write-Warn "No k8s patch file found at $patchFile"
        }
    }
    
    Write-Success "Debug environment enabled"
}

# =============================================================================
# Phase 2: Run K6 Load Tests
# =============================================================================

function Run-K6Tests {
    Write-Host ""
    Write-Info "Phase 2: Running K6 load tests..."
    
    $k6Dir = Join-Path $ProjectRoot "infra\k6"
    $k6Output = Join-Path $OUTDIR "k6"
    
    # Check if k6 is installed - try local binary first, then PATH
    $localK6 = Join-Path $ProjectRoot "tools\k6-new\k6-v0.54.0-windows-amd64\k6.exe"
    $fallbackK6 = Join-Path $ProjectRoot "tools\k6\k6-v0.49.0-windows-amd64\k6.exe"
    $k6Exe = $null
    
    if (Test-Path $localK6) {
        $k6Exe = $localK6
        Write-Info "  Using local k6 v0.54: $k6Exe"
    } elseif (Test-Path $fallbackK6) {
        $k6Exe = $fallbackK6
        Write-Info "  Using local k6 v0.49: $k6Exe"
    } else {
        $k6Cmd = Get-Command k6 -ErrorAction SilentlyContinue
        if ($k6Cmd) {
            $k6Exe = $k6Cmd.Source
            Write-Info "  Using PATH k6: $k6Exe"
        }
    }
    
    if (-not $k6Exe) {
        Write-Warn "k6 not found. Install from https://k6.io/docs/getting-started/installation/"
        Write-Warn "  Windows: winget install k6 --source winget"
        Write-Warn "  Or: choco install k6"
        return
    }
    
    $tests = @(
        @{ Name = "api_smoke"; File = "api_load_test.js"; Profile = "smoke"; RunId = "$TS-smoke" },
        @{ Name = "api_load"; File = "api_load_test.js"; Profile = "load"; RunId = "$TS-load" },
        @{ Name = "authenticated_load"; File = "authenticated_load_test.js"; Profile = "load"; RunId = "$TS-auth" },
        @{ Name = "chat_load"; File = "chat_send_load.js"; Profile = "load"; RunId = "$TS-chat" },
        @{ Name = "proximity_load"; File = "proximity_nearby_load.js"; Profile = "load"; RunId = "$TS-proximity" }
    )
    
    foreach ($test in $tests) {
        $testFile = Join-Path $k6Dir $test.File
        if (-not (Test-Path $testFile)) {
            Write-Warn "Test file not found: $testFile"
            continue
        }
        
        Write-Info "  Running $($test.Name)..."
        $env:K6_RUN_ID = $test.RunId
        $env:K6_PROFILE = $test.Profile
        
        $outputTxt = Join-Path $k6Output "$($test.Name).txt"
        $outputJson = Join-Path $k6Output "$($test.Name).json"
        
        try {
            $result = & $k6Exe run `
                -e "K6_BACKEND_URL=$BackendUrl" `
                -e "K6_PROFILE=$($test.Profile)" `
                -e "K6_RUN_ID=$($test.RunId)" `
                --out "json=$outputJson" `
                $testFile 2>&1
            
            $result | Out-File -FilePath $outputTxt -Encoding UTF8
            Write-Success "    $($test.Name) complete"
        } catch {
            Write-Warn "    $($test.Name) had issues: $_"
        }
    }
    
    Write-Success "K6 tests complete. Results in $k6Output"
}

# =============================================================================
# Phase 3: Run Lighthouse Audits
# =============================================================================

function Run-Lighthouse {
    Write-Host ""
    Write-Info "Phase 3: Running Lighthouse audits..."
    
    $lhOutput = Join-Path $OUTDIR "lighthouse"
    
    # Check if lighthouse is installed - try global, then npx
    $lhCmd = Get-Command lighthouse -ErrorAction SilentlyContinue
    $useNpx = $false
    
    if (-not $lhCmd) {
        # Try npx in frontend directory
        $frontendDir = Join-Path $ProjectRoot "frontend"
        if (Test-Path (Join-Path $frontendDir "node_modules\.bin\lighthouse.cmd")) {
            $useNpx = $true
            Write-Info "  Using npx lighthouse from frontend"
        } else {
            Write-Warn "lighthouse not found. Install with: npm install -g lighthouse"
            Write-Warn "  Or run: cd frontend && npm install lighthouse"
            return
        }
    }
    
    $pages = @(
        @{ Name = "home"; Url = "$FrontendUrl/" },
        @{ Name = "login"; Url = "$FrontendUrl/login" },
        @{ Name = "discover"; Url = "$FrontendUrl/discover" }
    )
    
    foreach ($page in $pages) {
        Write-Info "  Auditing $($page.Name) page..."
        $outputPath = Join-Path $lhOutput $page.Name
        
        try {
            if ($useNpx) {
                Push-Location (Join-Path $ProjectRoot "frontend")
                npx lighthouse $page.Url `
                    --output=json,html `
                    --output-path="$outputPath" `
                    --chrome-flags="--headless --no-sandbox --disable-gpu" `
                    --preset=desktop `
                    --quiet 2>&1 | Out-Null
                Pop-Location
            } else {
                lighthouse $page.Url `
                    --output=json,html `
                    --output-path="$outputPath" `
                    --chrome-flags="--headless --no-sandbox --disable-gpu" `
                    --preset=desktop `
                    --quiet 2>&1 | Out-Null
            }
            
            Write-Success "    $($page.Name) audit complete"
        } catch {
            Write-Warn "    $($page.Name) audit had issues: $_"
        }
    }
    
    Write-Success "Lighthouse audits complete. Results in $lhOutput"
}

# =============================================================================
# Phase 4: Collect Prometheus Metrics
# =============================================================================

function Collect-Metrics {
    Write-Host ""
    Write-Info "Phase 4: Collecting Prometheus metrics..."
    
    $promUrl = if ($env:PROMETHEUS_URL) { $env:PROMETHEUS_URL } else { "http://localhost:9090" }
    $promOutput = Join-Path $OUTDIR "prometheus"
    
    $queries = @(
        @{ Name = "http_p95_by_endpoint"; Query = "histogram_quantile(0.95,sum(rate(divan_http_request_duration_seconds_bucket[5m]))by(le,endpoint))" },
        @{ Name = "http_p99_by_endpoint"; Query = "histogram_quantile(0.99,sum(rate(divan_http_request_duration_seconds_bucket[5m]))by(le,endpoint))" },
        @{ Name = "error_rates"; Query = "sum(rate(divan_http_requests_total{status=~`"5..`"}[5m]))by(endpoint)/sum(rate(divan_http_requests_total[5m]))by(endpoint)" },
        @{ Name = "request_rate"; Query = "sum(rate(divan_http_requests_total[5m]))by(endpoint)" },
        @{ Name = "sampled_requests"; Query = "sum(rate(divan_sampled_requests_total[5m]))by(endpoint)" },
        @{ Name = "active_requests"; Query = "divan_http_active_requests" },
        @{ Name = "db_query_p95"; Query = "histogram_quantile(0.95,sum(rate(divan_db_query_duration_seconds_bucket[5m]))by(le,operation))" }
    )
    
    foreach ($q in $queries) {
        Write-Info "  Querying $($q.Name)..."
        $outputFile = Join-Path $promOutput "$($q.Name).json"
        $encodedQuery = [System.Web.HttpUtility]::UrlEncode($q.Query)
        $url = "$promUrl/api/v1/query?query=$encodedQuery"
        
        try {
            Invoke-RestMethod -Uri $url -OutFile $outputFile -ErrorAction Stop
            Write-Success "    $($q.Name) collected"
        } catch {
            Write-Warn "    $($q.Name) failed: $_"
        }
    }
    
    Write-Success "Metrics collected in $promOutput"
}

# =============================================================================
# Phase 5: Collect Traces
# =============================================================================

function Collect-Traces {
    Write-Host ""
    Write-Info "Phase 5: Collecting traces..."
    
    $jaegerUrl = if ($env:JAEGER_URL) { $env:JAEGER_URL } else { "http://localhost:16686" }
    $tracesOutput = Join-Path $OUTDIR "traces"
    
    $runTypes = @("smoke", "load", "chat", "proximity")
    
    foreach ($runType in $runTypes) {
        $runId = "$TS-$runType"
        Write-Info "  Fetching traces for run: $runId"
        $outputFile = Join-Path $tracesOutput "${runType}_traces.json"
        
        try {
            $url = "$jaegerUrl/api/traces?service=divan-backend&limit=100"
            Invoke-RestMethod -Uri $url -OutFile $outputFile -ErrorAction SilentlyContinue
            Write-Success "    $runType traces collected"
        } catch {
            Write-Warn "    $runType traces failed (Jaeger may not be running)"
        }
    }
    
    Write-Success "Traces collected in $tracesOutput"
}

# =============================================================================
# Phase 6: Generate Report
# =============================================================================

function Generate-Report {
    Write-Host ""
    Write-Info "Phase 6: Generating summary report..."
    
    $reportPath = Join-Path $OUTDIR "REPORT.md"
    
    $report = @"
# Divan Performance Profiling Report

**Session:** $TS  
**Environment:** $Env  
**Duration:** $DurationMins minutes  
**Backend URL:** $BackendUrl  
**Frontend URL:** $FrontendUrl  

---

## Artifacts

### K6 Load Test Results
| Test | Output | JSON |
|------|--------|------|
| API Smoke | ``k6/api_smoke.txt`` | ``k6/api_smoke.json`` |
| API Load | ``k6/api_load.txt`` | ``k6/api_load.json`` |
| Chat Load | ``k6/chat_load.txt`` | ``k6/chat_load.json`` |
| Proximity Load | ``k6/proximity_load.txt`` | ``k6/proximity_load.json`` |

### Lighthouse Audits
| Page | HTML Report | JSON Data |
|------|-------------|-----------|
| Home | ``lighthouse/home.report.html`` | ``lighthouse/home.report.json`` |
| Login | ``lighthouse/login.report.html`` | ``lighthouse/login.report.json`` |
| Discover | ``lighthouse/discover.report.html`` | ``lighthouse/discover.report.json`` |

### Prometheus Metrics
- ``prometheus/http_p95_by_endpoint.json`` - P95 latency by endpoint
- ``prometheus/http_p99_by_endpoint.json`` - P99 latency by endpoint
- ``prometheus/error_rates.json`` - Error rates by endpoint
- ``prometheus/request_rate.json`` - Request rate by endpoint
- ``prometheus/db_query_p95.json`` - Database query P95

### Traces
- ``traces/*_traces.json`` - Distributed traces by test run

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

*Generated by run_profiling_window.ps1 at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")*
"@

    $report | Out-File -FilePath $reportPath -Encoding UTF8
    Write-Success "Report generated: $reportPath"
}

# =============================================================================
# Phase 7: Disable Debug Environment
# =============================================================================

function Disable-DebugEnv {
    Write-Host ""
    Write-Info "Phase 7: Disabling debug environment..."
    
    # Reset environment variables
    $env:PERF_TRACE_LABELS = "false"
    $env:PERF_DEBUG_MODE = "false"
    $env:RUM_SAMPLE_RATE = "0.10"
    $env:TRACE_SAMPLE_RATE = "0.10"
    Remove-Item Env:\K6_VERBOSE -ErrorAction SilentlyContinue
    
    Write-Info "  PERF_TRACE_LABELS = false"
    Write-Info "  RUM_SAMPLE_RATE = 0.10"
    
    if ($Env -eq "local") {
        $composeFile = Join-Path $ProjectRoot "docker-compose.yml"
        if (Test-Path $composeFile) {
            Write-Info "Restarting docker-compose with normal env..."
            Push-Location $ProjectRoot
            try {
                docker-compose up -d --force-recreate backend 2>$null
            } catch {
                Write-Warn "docker-compose restart skipped"
            }
            Pop-Location
        }
    } else {
        $patchFile = Join-Path $ScriptDir "k8s\patch-staging-normal.yaml"
        if (Test-Path $patchFile) {
            Write-Info "Reverting Kubernetes to normal sampling..."
            try {
                kubectl apply -f $patchFile 2>$null
            } catch {
                Write-Warn "kubectl revert skipped"
            }
        }
    }
    
    Write-Success "Debug environment disabled"
}

# =============================================================================
# Main Execution
# =============================================================================

$startTime = Get-Date

try {
    Enable-DebugEnv
    Run-K6Tests
    Run-Lighthouse
    Collect-Metrics
    Collect-Traces
    Generate-Report
} finally {
    Disable-DebugEnv
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Magenta
Write-Success "Profiling session complete!"
Write-Host "==============================================================================" -ForegroundColor Magenta
Write-Info "Duration: $([math]::Floor($duration.TotalMinutes)) minutes $($duration.Seconds) seconds"
Write-Info "Artifacts: $OUTDIR"
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Open $OUTDIR\REPORT.md and fill in the analysis" -ForegroundColor White
Write-Host "  2. Review Lighthouse HTML reports in $OUTDIR\lighthouse\" -ForegroundColor White
Write-Host "  3. Import Grafana dashboard: infra\grafana\dashboards\divan-tracing.json" -ForegroundColor White
Write-Host "  4. Query Prometheus with trace_id from slow requests" -ForegroundColor White
Write-Host ""
