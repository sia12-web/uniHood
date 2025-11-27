# Security Fixes - 2025-11-25

## Summary
Applied security hardening measures to the backend configuration to prevent insecure defaults in production environments.

## Changes

### Backend (`backend/app/settings.py`)

1.  **Enforced Secret Keys**:
    -   Removed default values for `SECRET_KEY` and `SERVICE_SIGNING_KEY`.
    -   These environment variables are now **required**. The application will fail to start if they are not provided, preventing accidental deployment with insecure defaults.

2.  **Restricted CORS**:
    -   Changed `cors_allow_origins` default from `("*",)` (allow all) to `()` (allow none).
    -   Production environments must now explicitly specify allowed origins.

3.  **Production by Default**:
    -   Changed the default `ENVIRONMENT` setting from `dev` to `production`.
    -   This ensures that development-only features (like the naive file uploader in `main.py`) are disabled by default unless explicitly enabled by setting `ENV=dev`.

### Frontend (`frontend/middleware.ts`)

-   **Verification**: Reviewed `PUBLIC_PATHS` to ensure no sensitive routes are exposed to unauthenticated users. No changes were necessary as the configuration was found to be secure.

## Verification
-   Ran backend tests to verify configuration loading.
-   Manual verification of `settings.py` logic.
