# Forgot Password / Forgot Username Flow

This document describes the implementation of the secure "Forgot Password" and "Forgot Username" features.

## Features

1.  **Forgot Password**: Users can request a password reset link via email.
2.  **Forgot Username**: Users can request their username via email.
3.  **Reset Password**: Users can set a new password using a secure, time-limited token.

## Architecture

### Frontend
- **Pages**:
    - `/forgot-password`: Form to request password reset.
    - `/forgot-username`: Form to request username.
    - `/reset-password`: Form to set a new password (requires `token` query param).
- **Integration**: Uses `frontend/lib/identity.ts` to communicate with the backend.

### Backend
- **Endpoints**:
    - `POST /api/auth/forgot-password`: Triggers password reset email.
    - `POST /api/auth/forgot-username`: Triggers username reminder email.
    - `POST /api/auth/reset-password`: Consumes the token and updates the password.
- **Domain Logic**:
    - `backend/app/domain/identity/recovery.py`: Handles business logic, token generation, and database interactions.
    - `backend/app/domain/identity/mailer.py`: Handles email sending (currently stubs/logs to console in dev).
- **Security**:
    - Rate limiting on requests.
    - Generic error messages to prevent enumeration.
    - Secure, time-limited tokens (stored in `password_resets` table).
    - Password hashing using Argon2.

## Testing

Unit tests are located in `backend/tests/unit/test_identity_recovery.py`.
Run them with:
```bash
cd backend
python -m pytest tests/unit/test_identity_recovery.py
```
