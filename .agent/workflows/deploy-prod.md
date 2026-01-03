---
description: Promote changes from Development (dev-01) to Production (main) with Safety Checks
---

# 🚀 Production Deployment Workflow

Follow this strictly to ensure that what works in `dev-01` also works in `main`.

## 1. 🛡️ Pre-Flight Integrity Checks (CRITICAL)
Before merging, you **MUST** run the complete check-quality workflow and verify these common failure points:

### 0. 🧪 Run Quality Suite
```bash
/check-quality
```
Ensure **zero** lint errors in both Frontend and Backend.


### A. Frontend Environment Variables
Next.js **requires** static lookups for `NEXT_PUBLIC_` variables at build time.
- **Fail**: `const val = process.env[key]` (Returns `undefined` in Prod)
- **Fail**: `const val = process.env?.NEXT_PUBLIC_VAR` (Optional chaining breaks webpack replacement)
- **Pass**: `const val = process.env.NEXT_PUBLIC_API_URL` (Direct usage)

**Action**: Run this grep to catch dynamic usage:
```bash
grep -r "process.env\[" frontend/
grep -r "process.env?." frontend/
```

### B. Python Static Analysis (Backend)
The backend uses FastAPI. Missing imports or `NameError`s often survive until the endpoint is hit.
- **Action**: Run `ruff check .` or `flake8` to catch `F401` (unused imports) and `F821` (undefined names).
- **Check**: Specifically verify new services in `app/domain/` have all their dependencies imported.

### C. Database Migrations
Ensure that `dev` hasn't "drifted" from `prod`.
- Check `backend/migrations/` for any new `.sql` files.
- **Crucial**: Ensure the `preDeployCommand` on Render is set to run your migration script (e.g., `python scripts/apply_migrations.py`).

### C. CORS & Security
- Check `backend/app/main.py`.
- Ensure `allow_origins` explicitly includes:
  - `https://unihood.app`
  - `https://www.unihood.app`
  - `https://unihood-frontend.onrender.com`

---

## 2. 🔀 Merge & Promote

1. **Ensure local is up to date**
   ```bash
   git checkout dev-01
   git pull origin dev-01
   ```

2. **Switch to Main**
   ```bash
   git checkout main
   git pull origin main
   ```

3. **Merge Development**
   ```bash
   git merge dev-01
   ```

4. **🚀 Push to Production**
   *Triggers automatic deployment on Render*
   ```bash
   git push origin main
   ```

5. **Return to Development**
   ```bash
   git checkout dev-01
   ```

---

## 3. 🟢 Post-Deploy Verification

1. **Check Render Dashboard / API**:
   - Backend Service: `srv-d51m24euk2gs739vaf20`
   - Frontend Service: `srv-d51mjleuk2gs739vl9gg`

2. **Verify Logs**:
   Look for specific success indicators:
   - Backend: `Uvicorn running on http://0.0.0.0:10000` (Listening)
   - Database: `Finished 0XX_migration.sql` (Migrations applied)

3. **Smoke Test**:
   - Visit `https://unihood.app/login`
   - **Hard Refresh** (`Ctrl+F5` / `Cmd+Shift+R`) to clear old JS.
   - Attempt login.
