# Auth UX Flow (Algorithm)

## Pages
- /auth/login, /auth/signup, /auth/verify, /auth/forgot, /auth/reset

## Algorithm
1. On mount, if `rf_fp` cookie absent → show "Session expired" banner on protected routes.
2. On login:
   - Post credentials.
   - Store access token in memory (React state/query cache).
   - Do NOT store refresh token.
3. On 401 from API:
   - Attempt one silent refresh (hit /auth/refresh).
   - If success → retry original request once.
   - If fail → redirect to /auth/login with `next` param.

## Email Verification
- After signup, poll verification status every 10s (max 2m) or let user click "I verified" to re-check.
