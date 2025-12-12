# CI/CD with GitHub Actions Guide

This guide explains how to use GitHub Actions for continuous integration and deployment.

---

## 🚀 Quick Start

### Step 1: Push to GitHub
The workflows run automatically when you push code!

```bash
git add .
git commit -m "Your changes"
git push origin main
```

### Step 2: View Results
1. Go to your GitHub repository
2. Click the **"Actions"** tab
3. See all workflow runs and their status

---

## 📋 Workflows Included

### 1. Security Scan (`.github/workflows/security-scan.yml`)

**Runs:**
- On every push to `main` or `develop`
- On pull requests
- Daily at 2 AM UTC (scheduled)

**What it does:**
- ✅ Scans Python dependencies for vulnerabilities (Safety)
- ✅ Analyzes Python code for security issues (Bandit)
- ✅ Audits Node.js packages (npm audit)
- ✅ Scans Docker images (Trivy)

---

## 🔧 How to Enable GitHub Actions

### 1. Push the workflows to GitHub

```bash
# Make sure .github/workflows folder exists
git add .github/workflows/
git commit -m "Add CI/CD workflows"
git push origin main
```

### 2. Enable Actions in Repository Settings

1. Go to your repo on GitHub
2. Click **Settings** → **Actions** → **General**
3. Select **"Allow all actions and reusable workflows"**
4. Click **Save**

### 3. View Workflow Runs

1. Click **Actions** tab in your repo
2. See all runs with ✅ (passed) or ❌ (failed)
3. Click on a run to see details

---

## 🔐 Setting Up Secrets

Some workflows need secrets (for deployment, etc.):

1. Go to repo **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"**
3. Add secrets like:
   - `DOCKER_USERNAME`
   - `DOCKER_PASSWORD`
   - `DEPLOY_KEY`

---

## 📊 Workflow Status Badges

Add these to your README.md to show build status:

```markdown
![Security Scan](https://github.com/YOUR_USERNAME/Radius/actions/workflows/security-scan.yml/badge.svg)
```

---

## 🔄 Manual Workflow Triggers

To run a workflow manually:

1. Go to **Actions** tab
2. Select the workflow
3. Click **"Run workflow"** button
4. Select branch and click **"Run workflow"**

---

## 🛠️ Troubleshooting

### Workflow not running?
1. Check if `.github/workflows/` folder exists
2. Verify YAML syntax is correct
3. Check Actions is enabled in Settings

### Workflow failing?
1. Click on the failed run
2. Expand the failing step
3. Read the error message
4. Fix the issue and push again

### Common fixes:
```bash
# Reinstall dependencies
npm ci  # Instead of npm install

# Fix npm audit issues
npm audit fix

# Fix Python issues
pip install -r requirements.txt
```

---

## 📚 Additional Workflows You Can Add

### Testing Workflow
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          cd frontend && npm ci && npm test
```

### Deploy Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to server
        run: echo "Add your deploy commands here"
```

---

## 📅 Workflow Schedule Reference

| Cron Expression | When it runs |
|-----------------|--------------|
| `0 2 * * *` | Daily at 2 AM UTC |
| `0 0 * * 0` | Weekly on Sunday |
| `0 0 1 * *` | Monthly on the 1st |
| `*/15 * * * *` | Every 15 minutes |

---

## ✅ Current Setup Status

Your repository has:
- [x] Security scan workflow (runs on push + daily)
- [x] Python vulnerability scanning (Safety)
- [x] Python code analysis (Bandit)
- [x] Node.js audit (npm audit)
- [x] Docker image scanning (Trivy)

**To activate:** Just push to GitHub and it works automatically!

---

## 🎯 Next Steps

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add CI/CD and security workflows"
   git push origin main
   ```

2. **Check the Actions tab** on GitHub

3. **Enable Dependabot** (free!)
   - Go to Settings → Security → Enable Dependabot alerts

4. **Add status badges** to your README

---

**Need help?** Check GitHub's official docs: https://docs.github.com/en/actions
