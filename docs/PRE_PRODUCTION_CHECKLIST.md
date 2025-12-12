# Pre-Production Checklist

This document tracks tasks that MUST be completed before deploying to production.

## 🔴 Critical Security Fixes

### 1. Generate Secure Secrets
- [ ] Run `python scripts/generate_secrets.py`
- [ ] Copy secrets to production `.env` file
- [ ] Set `COOKIE_SECURE=true`
- [ ] Set `ENVIRONMENT=production`

### 2. Configure CORS
- [ ] Update `CORS_ALLOW_ORIGINS` to your production domain(s)
- [ ] Remove any `localhost` entries

### 3. Enable HTTPS
- [ ] Obtain SSL/TLS certificate
- [ ] Configure web server for HTTPS
- [ ] Enable HSTS headers

---

## 🟡 Dependency Vulnerabilities to Fix

### Frontend (npm) - Run before production!

**Command to fix:**
```bash
cd frontend
npm audit fix        # Safe fixes
npm audit fix --force  # If needed (may have breaking changes)
```

**Known vulnerabilities (as of 2024-12-11):**

| Package | Severity | Issue | Advisory |
|---------|----------|-------|----------|
| esbuild ≤0.24.2 | Moderate | Dev server can be accessed by any website | [GHSA-67hmc6258-q52c](https://github.com/advisories/GHSA-67hmc6258-q52c) |
| @lhci/cli | Low | Lighthouse CI issues | See npm audit |
| vitest | Low | Development testing framework | See npm audit |

**Note:** These are mostly dev dependencies and don't affect production builds, but should still be updated.

### Backend (Python)
- [ ] Run `pip install safety && safety check` inside Docker
- [ ] Fix any vulnerabilities found

---

## 🟢 Recommended Improvements

### Performance
- [ ] Enable production builds (`npm run build`)
- [ ] Configure CDN for static assets
- [ ] Enable gzip/brotli compression

### Monitoring
- [ ] Set up error monitoring (Sentry)
- [ ] Configure uptime monitoring
- [ ] Set up log aggregation

### Database
- [ ] Enable SSL connections
- [ ] Configure backups
- [ ] Set up connection pooling

---

## 📅 Last Updated
- **Date:** 2024-12-11
- **Next Review:** Before production deployment

---

## How to Use This Checklist

1. Before deploying to production, go through each item
2. Check off items as you complete them
3. Run security scans again after fixing:
   ```bash
   .\scripts\security-scan.ps1
   ```
4. Get a second pair of eyes to review

**Remember:** Security is not optional! 🔒
