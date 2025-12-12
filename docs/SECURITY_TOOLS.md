# Security Tools Reference Guide

A comprehensive list of security tools recommended for protecting the Radius application.

---

## 🛡️ Automated Security Scanning

### Snyk (Recommended)
- Scans your code for vulnerabilities in dependencies
- Free for open source projects
- Integrates with GitHub/GitLab

```bash
npm install -g snyk
snyk test  # Scan for vulnerabilities
```

**Website:** https://snyk.io

---

### OWASP Dependency-Check
- Free, open-source
- Scans Python and Node.js dependencies

```bash
pip install safety
safety check  # For Python
```

**Website:** https://owasp.org/www-project-dependency-check/

---

### Trivy (Docker Security)
- Scans Docker images for vulnerabilities
- Very fast and accurate

```bash
trivy image your-image-name
```

**Website:** https://trivy.dev

---

## 🔍 Code Security Analysis

### Bandit (Python)
- Static code analysis for Python security issues

```bash
pip install bandit
bandit -r backend/  # Scan Python code
```

**Website:** https://bandit.readthedocs.io

---

### ESLint Security Plugin (JavaScript/TypeScript)
- Finds security issues in JS/TS code

```bash
npm install --save-dev eslint-plugin-security
```

**Website:** https://github.com/eslint-community/eslint-plugin-security

---

## 🌐 Web Application Firewall

### Cloudflare (Free tier available)
- ✅ DDoS protection
- ✅ Bot detection
- ✅ SSL/TLS encryption
- ✅ Rate limiting
- ✅ WAF rules

**Website:** https://cloudflare.com

---

### Fail2Ban
- Blocks brute force attacks
- Monitors logs and bans IPs

```bash
sudo apt-get install fail2ban
```

**Website:** https://www.fail2ban.org

---

## 📊 Security Monitoring

### Sentry (Free tier)
- Error tracking
- Security issue alerts
- Performance monitoring

```bash
pip install sentry-sdk
```

**Website:** https://sentry.io

---

### OWASP ZAP (Free)
- Web application security scanner
- Penetration testing tool
- Finds XSS, SQL injection, etc.

**Website:** https://www.zaproxy.org

---

## 🔐 Secrets Management

### HashiCorp Vault (Production-grade)
- Secure secret storage
- Dynamic secrets
- Encryption as a service

**Website:** https://www.vaultproject.io

---

### AWS Secrets Manager / Azure Key Vault
- Cloud-based secret management
- Automatic rotation
- Integration with cloud services

**AWS:** https://aws.amazon.com/secrets-manager/
**Azure:** https://azure.microsoft.com/en-us/products/key-vault

---

## 🎯 Quick Setup for Your Project

### Recommended Starter Pack (All Free!)

1. **GitHub Security Features**
   - ✅ Dependabot (automatic dependency updates)
   - ✅ CodeQL security scanning
   - ✅ Secret scanning
   - Enable at: Repository → Settings → Security

2. **Pre-commit Hooks**
   ```bash
   pip install pre-commit detect-secrets
   # Add to .pre-commit-config.yaml
   ```

3. **Safety for Python Dependencies**
   ```bash
   pip install safety
   safety check --json
   ```

4. **npm audit for Node.js**
   ```bash
   npm audit
   npm audit fix
   ```

---

## 🚀 Recommended Implementation Order

### Phase 1: Immediate (Free)
- [ ] Enable GitHub Dependabot
- [ ] Enable GitHub Secret Scanning
- [ ] Run `npm audit` and `safety check`

### Phase 2: Before Production
- [ ] Set up Cloudflare (free tier) for DDoS protection
- [ ] Add Snyk to CI/CD pipeline
- [ ] Run OWASP ZAP scan

### Phase 3: Production
- [ ] Set up Sentry for error monitoring
- [ ] Configure Fail2Ban on server
- [ ] Consider HashiCorp Vault for secrets

---

## 📋 Local Security Scan Commands

Run these before each release:

```bash
# Frontend (Node.js)
cd frontend
npm audit

# Backend (Python) - inside Docker
docker compose exec backend pip install safety bandit
docker compose exec backend safety check
docker compose exec backend bandit -r app

# Docker images
trivy image radius-backend
trivy image radius-activities

# Or use our script:
.\scripts\security-scan.ps1  # Windows
bash scripts/security-scan.sh  # Linux/Mac
```

---

## 📅 Security Maintenance Schedule

| Task | Frequency |
|------|-----------|
| Run `npm audit` | Every week |
| Run `safety check` | Every week |
| Update dependencies | Every 2 weeks |
| Review Dependabot PRs | As they come |
| Full security audit | Before major releases |
| OWASP ZAP scan | Monthly or before releases |

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Python Security Guide](https://python.org/dev/security/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)

---

**Last Updated:** 2024-12-11
