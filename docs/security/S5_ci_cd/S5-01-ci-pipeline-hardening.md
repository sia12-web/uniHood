# S5-01: CI/CD Pipeline Hardening

> Status: ⚠️ **Partial** — Basic CI exists in `.github/workflows/ci.yml`, security hardening needed

## Goals

- Secure build artifacts and signing
- Minimize secrets exposure
- Enforce code review and security gates

## Current State

Location: `.github/workflows/ci.yml`

| Job | Status | Description |
|-----|--------|-------------|
| `frontend` | ✅ | Lint, typecheck, build, Vitest |
| `backend` | ✅ | pytest with Postgres/Redis |
| `frontend-e2e` | ✅ | Playwright E2E |
| **Security scanning** | ❌ | Not configured |

## Required Improvements

### 1. Least-Privilege Runners

```yaml
# Add to workflow jobs
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read        # Only read repo
      packages: write       # Only if publishing
      security-events: write # For CodeQL
```

### 2. Secrets Management

**Current Issues:**
- Secrets may be echoed in logs if commands fail
- No secret rotation automation

**Improvements:**
```yaml
# Add to all jobs
env:
  # Mask secrets in logs
  ACTIONS_STEP_DEBUG: false

steps:
  - name: Build
    run: |
      # Never echo secrets
      set +x
      # Use secrets only where needed
      echo "::add-mask::${{ secrets.API_KEY }}"
```

**Secret Inventory:**
| Secret | Purpose | Rotation |
|--------|---------|----------|
| `DOCKER_HUB_TOKEN` | Push images | 90 days |
| `DATABASE_URL` | Test DB | N/A (ephemeral) |
| `VERCEL_TOKEN` | Deploy preview | 90 days |

### 3. Branch Protection Rules

Configure in GitHub repo settings:

```
Branch: main
├── Require pull request reviews: ✅ (1+ approvals)
├── Dismiss stale reviews: ✅
├── Require status checks:
│   ├── frontend ✅
│   ├── backend ✅
│   ├── security-scan ✅ (add this)
│   └── dependency-check ✅ (add this)
├── Require branches up to date: ✅
├── Require signed commits: ⚠️ (recommended)
└── Include administrators: ✅
```

### 4. Artifact Signing (Future)

For production releases:
```yaml
- name: Sign release
  uses: sigstore/cosign-installer@v3
  
- name: Sign container image
  run: |
    cosign sign --key cosign.key ${{ env.IMAGE }}
```

### 5. Immutable Artifacts

```yaml
# Tag images with commit SHA, not just "latest"
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    tags: |
      ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ github.sha }}
      ${{ env.REGISTRY }}/${{ env.IMAGE }}:latest
    
# Deploy using SHA tag, not latest
- name: Deploy
  run: |
    kubectl set image deployment/backend backend=${{ env.IMAGE }}:${{ github.sha }}
```

## Updated CI Workflow

Add to `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  security-events: write
  pull-requests: write

jobs:
  # ... existing frontend/backend jobs ...

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'  # Fail on high/critical
          
      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Python dependencies
      - name: Check Python deps
        run: |
          pip install safety
          safety check -r backend/requirements.txt --full-report
          
      # Node dependencies  
      - name: Check Node deps
        working-directory: frontend
        run: |
          npm audit --audit-level=high
```

## Action Items

1. [ ] Add `permissions` block to all workflow jobs
2. [ ] Enable branch protection rules on `main`
3. [ ] Add security-scan job to CI
4. [ ] Add dependency-check job to CI
5. [ ] Audit and rotate CI secrets
6. [ ] Consider signed commits requirement
