# Session Guards (Algorithm)

## ProtectedRoute
1. If `accessToken` present and not expiring in <60s → allow.
2. If expiring soon → preemptive refresh (once).
3. If refresh fails → redirect to /auth/login?next=current.

## Tab Sync
- Listen to `storage` events for `auth:logout` broadcast.
- On event → purge memory token + navigate to login.
