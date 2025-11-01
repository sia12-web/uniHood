# How to Test SSO Verification (Phase 4)

## Terminal Setup
You will need **three terminals** for a complete SSO verification test:

1. **Backend API Terminal**
   - Name: `backend-api`
   - Command:
     ```powershell
     cd 'C:\Users\shahb\OneDrive\Desktop\Divan\backend'
     uvicorn app.main:app --reload --port 8000
     ```

2. **Frontend Terminal**
   - Name: `frontend`
   - Command:
     ```powershell
     cd 'C:\Users\shahb\OneDrive\Desktop\Divan\frontend'
     npm run dev
     ```

3. **Metrics/DB Monitor Terminal**
   - Name: `monitor`
   - Command (example for Postgres):
     ```powershell
     cd 'C:\Users\shahb\OneDrive\Desktop\Divan'
     psql <your_connection_string>
     -- or for Redis:
     redis-cli
     ```
   - Use this terminal to watch trust_profiles, verifications, and Prometheus metrics.

## Step-by-Step SSO Test
1. **Start all three terminals as above.**
2. In your browser, open `http://localhost:3000/identity/verify`.
3. Click "Connect Google" or "Connect Microsoft" to start SSO.
4. In the popup, paste a campus-qualified email (e.g., `user@yourcampus.edu`).
5. Complete the SSO flow; check the backend logs for `verify_sso_attempt_total` and DB for new verification rows.
6. Confirm your trust badge updates in the UI and DB.

## Troubleshooting
- If SSO fails, check the backend terminal for error logs.
- If the trust badge does not update, inspect the DB in the monitor terminal.
- For rate limit errors, clear Redis keys or wait for TTL expiry.

---
**Tip:** You can run `python -m pytest -q` in a fourth terminal to validate backend tests after SSO changes.