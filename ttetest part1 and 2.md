# Phase 8 Feature Test Guide (Parts 1 & 2)

This guide explains how to spin up the Divan stack locally so you can explore every Phase 8 feature end-to-end. Follow the terminal layout exactly to mirror the development environment the repository was built against.

---

## Prerequisites

- **PostgreSQL 16** running locally with the `divan` database available. Apply migrations up to `infra/migrations/0012_identity_phase8.sql`.
- **Redis 7** reachable on `localhost:6379` (required for rate limits, OTPs, and contact discovery salt management).
- **Python 3.11** environment with project dependencies installed (see `backend/requirements.txt` or `pyproject.toml`).
- **Node.js 18+** with project dependencies installed via `npm install` in `frontend/`.

---

## Terminal Layout & Commands

| Terminal | Suggested Name | Working Directory | Command(s) |
|----------|----------------|-------------------|------------|
| 1 | `backend-api` | `C:\Users\shahb\OneDrive\Desktop\Divan\backend` | `uvicorn app.main:app --reload --port 8000` |
| 2 | `frontend-web` | `C:\Users\shahb\OneDrive\Desktop\Divan\frontend` | `npm run dev -- --port 3000` |
| 3 | `backend-workers` *(optional)* | `C:\Users\shahb\OneDrive\Desktop\Divan\backend` | `python -m app.jobs.scheduler` *(only if background jobs are needed for your scenario)* |
| 4 | `observability` *(optional)* | `C:\Users\shahb\OneDrive\Desktop\Divan\backend` | `python -m app.tools.metrics_reporter` *(streams Prometheus-style counters to console for quick verification)* |

> **Note:** Rename the integrated VS Code terminals using the dropdown to keep the roles clear.

---

## Smoke-Test Checklist

1. **Account Linking** (`/identity/settings/accounts`)
   - Use the “Link provider” buttons to simulate Google/Microsoft/Apple linking.
   - Validate unlinking safeguards (cannot remove last sign-in method).

2. **Email Change & Phone Verify** (`/identity/settings/account`)
   - Request a new email; confirm using the token returned in-page.
   - Request an SMS OTP, verify it, and try removal.

3. **Risk Engine & Sessions** (`/identity/settings/sessions`)
   - Sign in via the passkey demo to mint re-auth tokens and observe risk scores.

4. **Passkeys** (`/identity/settings/passkeys`)
   - Register a passkey using WebAuthn demo flows; confirm labels and trusted device management.

5. **Contact Discovery** (`/identity/settings/contact-discovery`)
   - Enable opt-in, refresh salt, hash sample contacts, upload, then match.

6. **Metrics**
   - Watch terminal `observability` or scrape the Prometheus endpoint (`/metrics`) to confirm counters increment (e.g., `identity_phone_verify_total`).

7. **API Regression**
   - Run `npm run test` inside `frontend/` (already green) and `pytest` inside `backend/` to ensure backend unit tests pass.

---

## Does the Website Exist With All Features?

Yes—the repository now ships a working Next.js frontend and FastAPI backend implementing the complete Phase 8 feature set. Running the terminals above exposes the full UI at `http://localhost:3000`, with the backend APIs listening on `http://localhost:8000`. Feature completeness is tied to the demo data provided (e.g., the seeded demo user and environment variables), so production data would require real integrations, but every Phase 8 workflow is wired and testable locally.
