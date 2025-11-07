# Divan — local Docker stack

This repository includes a Docker Compose stack for running the backend API, PostgreSQL, and Redis locally.

## Prerequisites
- Docker Desktop

## Run the stack

PowerShell (Windows):

- Start services
  - docker compose -f .\infra\docker\compose.yaml up -d

- Check status
  - docker compose -f .\infra\docker\compose.yaml ps

- View backend logs
  - docker compose -f .\infra\docker\compose.yaml logs -f backend

## Services
- API: http://localhost:8000 (Open http://localhost:8000/docs for Swagger UI)
- PostgreSQL: localhost:5432 (user: postgres, password: postgres, db: divan)
- Redis: localhost:6379

## Frontend (Next.js)
- Install deps
  - cd .\frontend
  - npm ci
- Dev server (default port 3000)
  - npm run dev
- Production build + start (choose a free port, e.g., 3010)
  - npm run build
  - npx next start -p 3010
  - Open http://localhost:3010
- Environment setup
  - Copy `.env.example` to `.env.local` in `frontend/`
  - Fill any `NEXT_PUBLIC_DEMO_*` variables (handles, chat peer IDs, activity IDs) to unlock direct links on hub pages
  - Restart `npm run dev` after edits so the values refresh
  - Optional: enable the proximity "Go Live" feature for local testing
    - Add `NEXT_PUBLIC_ENABLE_GO_LIVE=true` to `frontend/.env.local` (or run `setx NEXT_PUBLIC_ENABLE_GO_LIVE "true"` in PowerShell and restart your terminal)
    - Visit `/proximity` and click "Go live now"; in demo mode (logged out or demo campus) a fallback location is used, otherwise grant location permission
    - A successful heartbeat records a timestamp in `localStorage`; the homepage Proximity card shows "Live now" for ~90 seconds after a heartbeat (polls every ~15s)
- Key routes
  - Home: http://localhost:3000/
  - Login: http://localhost:3000/login
  - Onboarding: http://localhost:3000/onboarding
  - Verification: http://localhost:3000/verify
  - Friends hub: http://localhost:3000/friends
  - Invites inbox: http://localhost:3000/invites
  - Smart matching: http://localhost:3000/match
  - Rooms hub: http://localhost:3000/rooms
  - Communities search: http://localhost:3000/communities/search
  - Search & discovery: http://localhost:3000/search
  - Leaderboards: http://localhost:3000/leaderboards
  - Communities hub: http://localhost:3000/communities
- Tests
  - Contract: npm run test -- communities
  - E2E: npm run test:e2e -- communities

## Notes
- The backend container installs Poetry and dependencies on startup and then serves FastAPI via Uvicorn.
- The Compose file maps backend port 8000 to your host.
- If you change Python dependencies in `backend/pyproject.toml`, regenerate the lockfile on your host and rebuild the backend container.
