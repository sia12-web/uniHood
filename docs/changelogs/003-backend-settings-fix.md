# Backend Settings Configuration Fix - 2025-11-25

## Summary
Fixed critical startup crashes in the backend container caused by `SettingsError` and `ValidationError` when parsing environment variables.

## Root Causes
1. **Missing Environment Value**: `MODERATION_STAFF_IDS` was defined in `.env` but had no value, causing it to be read as `None` or empty string, which failed validation.
2. **Pydantic Settings Parsing**: The `pydantic-settings` library attempts to parse complex types (like `tuple[str, ...]`) as JSON strings *before* passing them to custom validators. This caused parsing errors for simple comma-separated strings.
3. **Missing Field Definition**: The `.env` file contained `REFRESH_PEPPER`, but this field was missing from the `Settings` class definition. Since `extra="forbid"` is enabled, this caused a `ValidationError`.

## Changes Applied

### 1. Environment Configuration (`backend/.env`)
- Added a valid UUID tuple for `MODERATION_STAFF_IDS`.

### 2. Settings Code (`backend/app/settings.py`)
- **Type Safety**: Changed type annotations for `moderation_staff_ids` and `cors_allow_origins` from `tuple[str, ...]` to `Any`. This bypasses Pydantic's automatic JSON parsing, allowing our custom validators to handle the raw input (string, list, or JSON) safely.
- **Missing Field**: Added `refresh_pepper: str` to the `Settings` class to match the environment configuration.
- **Validator Logic**: Updated validators to robustly handle:
    - `None` or empty strings
    - JSON-encoded arrays
    - Comma-separated strings
    - Pre-parsed lists/tuples

## Verification
- **Local Test**: `python backend/test_settings.py` passes successfully.
- **Container**: Backend container builds and starts successfully.
- **Logs**: "Application startup complete" confirmed in container logs.
