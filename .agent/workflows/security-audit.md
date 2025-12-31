---
description: Perform a comprehensive security audit (Secrets, SQL Injection, Dependencies)
---
# Security Audit Workflow

Run this workflow periodically or before major releases to ensure the application is secure.

## 1. Client-Side Secret Leak Check
Ensure no sensitive environment variables or keys are leaked to the client bundle.

### 1.1 Check for Backend Secrets in Frontend Code
Run the following command to find potentially leaked secrets in the `frontend` directory.
// turbo
```bash
grep -rEi "SECRET_KEY|API_KEY|PASSWORD|TOKEN" frontend/app frontend/components --include=*.tsx --include=*.ts --exclude-dir=node_modules
```
**Action**: If any results appear that are NOT explicit `NEXT_PUBLIC_` variables, **remove them immediately**. 
*   ❌ Bad: `const apiKey = "12345";`
*   ✅ Good: `const apiKey = process.env.NEXT_PUBLIC_API_KEY;`
*   ⚠️ Critical: NEVER use `process.env.SECRET_KEY` in frontend code. It will be undefined or leak if misconfigured.

### 1.2 Verify `.env` handling
Ensure `.env` files are in `.gitignore`.
// turbo
```bash
grep ".env" .gitignore
```

## 2. SQL Injection Vulnerability Scan
The backend uses `asyncpg`. Ensure all queries use **parameter substitution** (`$1`, `$2`) and NOT f-string formatting.

### 2.1 Scan for Dangerous SQL patterns
Search for f-strings used inside SQL execution calls.
// turbo
```bash
grep -r "execute(f\"" backend/app
grep -r "fetch(f\"" backend/app
grep -r "fetchrow(f\"" backend/app
```
**Action**: 
*   ❌ Bad: `await conn.execute(f"SELECT * FROM users WHERE id = '{user_id}'")`
*   ✅ Good: `await conn.execute("SELECT * FROM users WHERE id = $1", user_id)`

If any f-string SQL queries are found, refactor them immediately to use bind parameters.

## 3. Dependency Vulnerability Check

### 3.1 Frontend Audit
// turbo
```bash
cd frontend && npm audit
```

### 3.2 Backend Audit
// turbo
```bash
cd backend && pip install pip-audit && pip-audit
```

## 4. API Security Header Verification
Ensure the backend is setting security headers.
Check `backend/app/main.py` for `CORSMiddleware` configuration.
*   Ensure `allow_origins` is NOT `["*"]` in production. It should be the specific frontend domain (e.g., `https://unihood-frontend.onrender.com`).
