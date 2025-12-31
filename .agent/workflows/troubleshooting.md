---
description: Diagnose and resolve common issues across the stack
---
# Troubleshooting Guide

Use this workflow when something is broken.

## 1. Deployment Issues (Render)
If the app is not working in production:
1.  Run the **Render Operations** workflow:
    ```bash
    /render-ops
    ```
2.  Check the "Events" for the service in question to see if the build or deploy failed.
3.  Common Render Failures:
    *   **Build Failed**: Usually a `Dockerfile` issue or missing dependency. Check Build Logs.
    *   **Health Check Failed**: The app didn't start on port `10000` (or `$PORT`) within the timeout. Check `preDeployCommand`.
    *   **Polyfill Error**: If `apply_migrations.py` fails, verify the polyfill script exists in root.

## 2. Backend Issues
### 2.1 Database Connection
If logs show "Cannot connect to postgres":
1.  Verify `POSTGRES_URL` in Render Environment Variables.
2.  Ensure the "Internal URL" is used for backend-to-postgres communication within Render.

### 2.2 Migrations Failed
If the app crashes on startup:
1.  Check if `preDeployCommand` ran successfully.
2.  If the schema is missing, run migrations manually:
    *   SSH into the Render instance (via dashboard).
    *   Run `python scripts/apply_migrations.py`.

## 3. Frontend Issues
### 3.1 "500 Internal Server Error" on API calls
1.  Check the Browser Network Tab.
2.  If the request is to `localhost:8000`, the `NEXT_PUBLIC_API_URL` is wrong. It must match the production backend URL.

### 3.2 CORS Errors
"Access to fetch at ... from origin ... has been blocked by CORS policy"
1.  Check `backend/app/main.py`.
2.  Ensure the frontend domain is in the `origins` list.
