# S5-02: Automated SAST & DAST

> Status: ❌ **Not Implemented** — Priority action item

## Goals

- Run static analysis (SAST) on every PR to catch vulnerabilities before merge
- Run dynamic analysis (DAST) nightly against staging
- Automate dependency vulnerability scanning

## SAST (Static Application Security Testing)

### Tool Selection

| Tool | Language | Purpose | License |
|------|----------|---------|---------|
| **Semgrep** | Python, JS/TS | Code patterns, security rules | Free tier |
| **Bandit** | Python | Python-specific security | OSS |
| **ESLint security** | JS/TS | Frontend security rules | OSS |
| **Trivy** | All | Container + filesystem scan | OSS |
| **CodeQL** | All | GitHub native, deep analysis | Free for public |

### Recommended: Semgrep + Bandit + Trivy

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM

permissions:
  contents: read
  security-events: write
  pull-requests: write

jobs:
  sast-semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/python
            p/typescript
          generateSarif: true
          
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: semgrep.sarif

  sast-bandit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          
      - name: Install Bandit
        run: pip install bandit[toml]
        
      - name: Run Bandit
        run: |
          bandit -r backend/ \
            -f sarif \
            -o bandit-results.sarif \
            --severity-level medium \
            --confidence-level medium \
            || true
            
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: bandit-results.sarif
          
      - name: Fail on high severity
        run: |
          bandit -r backend/ \
            --severity-level high \
            --confidence-level high \
            --exit-zero-if-skipped

  sast-trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif
          
      - name: Fail on critical
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          exit-code: '1'
          severity: 'CRITICAL'
```

### Custom Semgrep Rules

Create `.semgrep/custom-rules.yml`:

```yaml
rules:
  - id: hardcoded-jwt-secret
    patterns:
      - pattern-either:
          - pattern: SECRET_KEY = "..."
          - pattern: jwt.encode(..., "...", ...)
    message: "Hardcoded JWT secret detected"
    severity: ERROR
    languages: [python]

  - id: sql-injection-risk
    patterns:
      - pattern: |
          f"... {$VAR} ..."
      - pattern-inside: |
          $CONN.execute(...)
    message: "Potential SQL injection - use parameterized queries"
    severity: ERROR
    languages: [python]

  - id: password-in-log
    pattern: |
      $LOG.$METHOD(..., password=..., ...)
    message: "Password may be logged"
    severity: WARNING
    languages: [python]
```

## DAST (Dynamic Application Security Testing)

### Nightly Staging Scan

```yaml
# .github/workflows/dast-nightly.yml
name: DAST Nightly

on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM daily
  workflow_dispatch:

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Start staging environment
        run: |
          docker compose -f docker-compose.staging.yml up -d
          sleep 30  # Wait for services
          
      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.10.0
        with:
          target: 'http://localhost:8000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j'
          
      - name: ZAP API Scan
        uses: zaproxy/action-api-scan@v0.5.0
        with:
          target: 'http://localhost:8000/openapi.json'
          format: openapi
          
      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: zap-report
          path: report_html.html
          
      - name: Cleanup
        if: always()
        run: docker compose -f docker-compose.staging.yml down
```

### Auth-Aware DAST

Create `.zap/context.xml` for authenticated scanning:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <context>
    <name>Divan Staging</name>
    <auth>
      <type>json</type>
      <loginUrl>http://localhost:8000/api/auth/login</loginUrl>
      <loginRequestData>{"email":"test@staging.edu","password":"test123"}</loginRequestData>
      <tokenExtract>$.access_token</tokenExtract>
      <tokenHeader>Authorization: Bearer {token}</tokenHeader>
    </auth>
  </context>
</configuration>
```

## Dependency Scanning

### Python Dependencies

```yaml
  dependency-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install safety
        run: pip install safety pip-audit
        
      - name: Check with Safety
        run: |
          safety check \
            -r backend/pyproject.toml \
            --full-report \
            --output json > safety-report.json || true
            
      - name: Check with pip-audit
        run: |
          pip-audit \
            -r backend/pyproject.toml \
            --format json > pip-audit-report.json || true
            
      - name: Create Issue on CVE
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('safety-report.json'));
            // Create issue with CVE details
```

### Node Dependencies

```yaml
  dependency-node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        working-directory: frontend
        run: pnpm install --frozen-lockfile
        
      - name: Audit dependencies
        working-directory: frontend
        run: |
          pnpm audit --json > audit-report.json || true
          
      - name: Fail on high severity
        working-directory: frontend
        run: pnpm audit --audit-level=high
```

### Container Scanning

```yaml
  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: docker build -t divan-backend:test backend/
        
      - name: Scan with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'divan-backend:test'
          format: 'sarif'
          output: 'trivy-container.sarif'
          severity: 'CRITICAL,HIGH'
          
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-container.sarif
```

## Report Automation

### PR Comments

```yaml
  report-pr:
    needs: [sast-semgrep, sast-bandit, dependency-python]
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const summary = `
            ## 🔒 Security Scan Results
            
            | Check | Status |
            |-------|--------|
            | Semgrep | ${{ needs.sast-semgrep.result }} |
            | Bandit | ${{ needs.sast-bandit.result }} |
            | Dependencies | ${{ needs.dependency-python.result }} |
            
            See the Security tab for detailed findings.
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: summary
            });
```

## Action Items

1. [ ] Add `security.yml` workflow to `.github/workflows/`
2. [ ] Create `.semgrep/custom-rules.yml`
3. [ ] Add `.zap/` configuration directory
4. [ ] Configure branch protection to require security checks
5. [ ] Set up nightly DAST against staging
6. [ ] Create automation for CVE→Issue creation
